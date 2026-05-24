# Auth Persistence + Migrations DDL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todos los roles mantengan la sesión al recargar la página, y que las migraciones DDL no fallen por permisos en cada rebuild.

**Architecture:**
- `auth.ts` `loadUser()` hoy descarta la sesión cuando el access_token expirado falla en `/me`, sin intentar el refresh token que SÍ existe en la cookie. El fix es: en el catch de `/me`, limpiar localStorage y reintentar con `doRefresh()` antes de rendirse.
- `aerofinder.sh` agrega `run_migrations()` que corre `alembic upgrade head` en el contenedor backend. Si falla por `InsufficientPrivilegeError` (ownership DDL), extrae la revisión pendiente, ejecuta el DDL como superusuario postgres, y marca con `alembic stamp`.

**Tech Stack:** Zustand, js-cookie, Next.js 14 App Router, Bash, Docker Compose, Alembic.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/store/auth.ts` | Fix `loadUser()` catch + `refreshToken()` actualiza localStorage |
| `scripts/aerofinder.sh` | Agregar `run_migrations()` + llamarla en `cmd_start` |

---

## Task 1: Fix `refreshToken()` — actualizar localStorage al renovar

**Archivos:**
- Modify: `frontend/src/store/auth.ts:111-125`

Hoy cuando `refreshToken()` obtiene un nuevo access_token, lo guarda solo en memoria Zustand. Si el usuario recarga de nuevo antes de que `loadUser()` lo persista, el ciclo se repite. Hay que guardarlo en localStorage inmediatamente.

- [ ] **Paso 1: Modificar `refreshToken()` en `auth.ts`**

Reemplazar el bloque `refreshToken` (líneas 110-125):

```typescript
  // ── Refresh automático ────────────────────────────────────────────────────────
  refreshToken: async (): Promise<boolean> => {
    const refreshToken = Cookies.get(REFRESH_COOKIE);
    if (!refreshToken) return false;

    try {
      const newToken = await authApi.refresh(refreshToken);
      // Persistir en localStorage para que la próxima recarga lo encuentre
      if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_KEY, newToken);
      }
      set({ accessToken: newToken, isAuthenticated: true });
      return true;
    } catch {
      // Token inválido o expirado: limpiar sesión
      Cookies.remove(REFRESH_COOKIE);
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
      }
      set({ user: null, accessToken: null, isAuthenticated: false });
      return false;
    }
  },
```

- [ ] **Paso 2: Verificar manualmente**

En browser: login → esperar 1 min (o reducir temporalmente `ACCESS_TOKEN_EXPIRE_MINUTES=1` en `.env` y hacer `docker compose restart backend`) → recargar → debe quedar sesión activa.

---

## Task 2: Fix `loadUser()` — reintentar con refresh cuando `/me` falla

**Archivos:**
- Modify: `frontend/src/store/auth.ts:127-173`

El bug principal: el catch de `loadUser()` borra todo sin intentar `doRefresh()`. Si el access_token en localStorage expiró pero el refresh_token en cookie es válido, la sesión se pierde innecesariamente.

- [ ] **Paso 1: Reemplazar `loadUser()` completo en `auth.ts`**

Reemplazar desde `// ── Carga del usuario al restaurar sesión` hasta el cierre `},` (líneas 127-173):

```typescript
  // ── Carga del usuario al restaurar sesión ─────────────────────────────────────
  loadUser: async () => {
    // Evitar doble invocación (AuthProvider + InnerLayout montan en paralelo)
    if (get().isInitialized || get().isLoading) return;

    const { refreshToken: doRefresh } = get() as AuthState & {
      refreshToken: () => Promise<boolean>;
    };

    let { accessToken } = get();

    // Intentar recuperar token desde localStorage si no está en memoria
    if (!accessToken && typeof window !== "undefined") {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        accessToken = stored;
        set({ accessToken: stored });
      }
    }

    // Sin token en memoria ni localStorage → intentar refresh desde cookie
    if (!accessToken) {
      const refreshed = await doRefresh();
      if (!refreshed) {
        set({ isInitialized: true });
        return;
      }
      accessToken = get().accessToken;
    }

    set({ isLoading: true });
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch {
      // Access token expirado — limpiar localStorage y reintentar con refresh
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
      }
      set({ accessToken: null });

      const refreshed = await doRefresh();
      if (refreshed) {
        try {
          const user = await authApi.me();
          set({ user, isAuthenticated: true, isLoading: false, isInitialized: true });
          return;
        } catch {
          // refresh token también inválido — caer a limpieza total
        }
      }

      // Sin sesión recuperable
      Cookies.remove(REFRESH_COOKIE);
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
        isInitialized:   true,
      });
    }
  },
```

- [ ] **Paso 2: Verificar build sin errores TypeScript**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Esperado: sin errores de tipo. Warnings de ESLint sobre `exhaustive-deps` en otros archivos son OK.

- [ ] **Paso 3: Verificar comportamiento en browser**

Flujo a probar:
1. Login en `http://IP:3000/login` → ingresar credenciales → debe redirigir a dashboard
2. Recargar la página (F5 / pull-to-refresh en móvil) → debe quedarse en dashboard (no redirigir a login)
3. Abrir DevTools → Application → Cookies → verificar que `aerofinder_refresh` existe
4. Abrir Application → Local Storage → verificar que `aerofinder_token` existe

- [ ] **Paso 4: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/store/auth.ts
git commit -m "fix: loadUser retries refresh when access_token expired — persists session on reload"
```

---

## Task 3: `aerofinder.sh` — función `run_migrations()`

**Archivos:**
- Modify: `scripts/aerofinder.sh`

Agregar `run_migrations()` que corre `alembic upgrade head`. Si falla por ownership DDL, extrae la revisión head pendiente, ejecuta el ALTER como superusuario postgres, y marca con `alembic stamp`.

- [ ] **Paso 1: Agregar función `run_migrations()` en `aerofinder.sh`**

Insertar ANTES de `# ── minio-init (one-shot)` (después de `sync_db_passwords`):

```bash
# ── Aplicar migraciones Alembic en cada arranque ─────────────────────────────
run_migrations() {
  info "Aplicando migraciones de base de datos..."

  # Intentar upgrade normal primero
  local output exit_code
  output=$(docker compose exec -T backend alembic upgrade head 2>&1)
  exit_code=$?

  if [ $exit_code -eq 0 ]; then
    ok "Migraciones aplicadas."
    return
  fi

  # Detectar fallo por ownership DDL (InsufficientPrivilegeError)
  if echo "$output" | grep -q "InsufficientPrivilegeError\|must be owner"; then
    warn "Fallo de permisos DDL — aplicando como superusuario postgres..."

    # Obtener la revisión head y la actual para saber qué migration falló
    local head_rev current_rev
    head_rev=$(docker compose exec -T backend alembic heads 2>/dev/null | awk '{print $1}' | head -1)
    current_rev=$(docker compose exec -T backend alembic current 2>/dev/null | grep -v INFO | awk '{print $1}' | head -1)

    if [ -z "$head_rev" ] || [ "$head_rev" = "$current_rev" ]; then
      warn "No se pudo determinar la revisión pendiente. Revisá manualmente: docker compose exec backend alembic upgrade head"
      return 1
    fi

    # Extraer el SQL de upgrade de la migración pendiente y ejecutarlo como postgres
    local upgrade_sql
    upgrade_sql=$(docker compose exec -T backend alembic upgrade "${head_rev}" --sql 2>/dev/null | grep -v "^--\|^$\|^BEGIN\|^COMMIT\|alembic_version")

    if [ -z "$upgrade_sql" ]; then
      warn "No se pudo extraer SQL de la migración. Aplicando vía psql directo..."
    else
      docker compose exec -T postgres psql -U postgres -d aerofinder <<-EOSQL
${upgrade_sql}
EOSQL
    fi

    # Marcar la revisión como aplicada en alembic_version
    docker compose exec -T backend alembic stamp "${head_rev}" 2>&1 | grep -v INFO
    ok "Migración ${head_rev} aplicada como superusuario."
    return
  fi

  # Otro tipo de error — mostrar output y advertir
  warn "Error en migraciones (no DDL ownership):"
  echo "$output" | tail -10
  warn "Revisá manualmente: docker compose exec backend alembic upgrade head"
}
```

- [ ] **Paso 2: Llamar `run_migrations()` en `cmd_start` después de `sync_db_passwords`**

En `cmd_start`, el bloque actual es:

```bash
  step "Sincronizando contraseñas DB"
  sync_db_passwords

  step "Inicializando MinIO"
```

Reemplazar por:

```bash
  step "Sincronizando contraseñas DB"
  sync_db_passwords

  step "Aplicando migraciones"
  run_migrations

  step "Inicializando MinIO"
```

- [ ] **Paso 3: Verificar sintaxis del script**

```bash
bash -n scripts/aerofinder.sh && echo "Sintaxis OK"
```

Esperado: `Sintaxis OK` sin errores.

- [ ] **Paso 4: Simular migración pendiente para probar el fallback**

```bash
# Bajar la revisión artificialmente para probar
docker compose exec -T backend alembic downgrade -1 2>&1 | tail -3
# Esperado: falla por ownership (mismo error que antes)

# Ahora probar la función directamente
cd /home/wiz/aerofinder && bash -c 'source scripts/aerofinder.sh 2>/dev/null; run_migrations'
# Esperado: detecta fallo de permisos, aplica como postgres, stamp correcto

# Verificar que quedó en head
docker compose exec -T backend alembic current 2>&1 | grep -v INFO
```

- [ ] **Paso 5: Commit**

```bash
git add scripts/aerofinder.sh
git commit -m "fix: run_migrations en aerofinder.sh — DDL fallback como superusuario postgres"
```

---

## Verificación final end-to-end

- [ ] **Probar flujo completo post-rebuild**

```bash
cd /home/wiz/aerofinder
./scripts/aerofinder.sh start --rebuild
```

Verificar en output:
- `Sincronizando contraseñas DB` → `Contraseñas de roles sincronizadas.`
- `Aplicando migraciones` → `Migraciones aplicadas.` (o fallback si hay pendientes)
- Sistema levanta sin errores

- [ ] **Probar login y persistencia de sesión en móvil**

1. Abrir `http://IP:3000` en celular
2. Login con cualquier rol → accede al dashboard
3. Cerrar y reabrir el browser (no logout)
4. Navegar a `http://IP:3000/dashboard` → debe entrar directamente sin pedir login
5. Probar con familiar → `/dashboard/familiar` → misma verificación
