# Credential Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rotar todas las credenciales expuestas en historial git y establecer `.env.example` como fuente de verdad documentada para nuevos setups.

**Architecture:** Se generan 8 secretos nuevos con `openssl rand`, se escribe el `.env` con esos valores, se crea `.env.example` con placeholders, y se hace reset limpio de los volúmenes Docker para que DB y MinIO arranquen con las credenciales nuevas.

**Tech Stack:** openssl, docker compose v2, bash

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `.env` | Modificar | Credenciales reales de la instancia local |
| `.env.example` | Crear | Plantilla documentada sin valores reales |
| `.gitignore` | Sin cambios | Ya ignora `.env` correctamente |

---

### Task 1: Generar los 8 secretos nuevos

**Files:**
- Modify: `.env`

- [ ] **Step 1: Generar todos los secretos en un bloque**

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
echo "POSTGRES_APP_PASSWORD=$(openssl rand -hex 32)"
echo "POSTGRES_WORKER_PASSWORD=$(openssl rand -hex 32)"
echo "POSTGRES_AUDIT_PASSWORD=$(openssl rand -hex 32)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)"
echo "MINIO_SECRET_KEY=$(openssl rand -hex 32)"
echo "SECRET_KEY=$(openssl rand -hex 64)"
```

Guardar cada valor — se usan en el paso siguiente. Verificar que ningún valor se repite (especialmente WORKER vs AUDIT, que antes eran iguales).

- [ ] **Step 2: Verificar que se generaron valores distintos**

```bash
# Los 7 valores de 32 bytes deben ser todos diferentes
# El SECRET_KEY debe tener 128 caracteres (64 bytes hex)
```

Correr los comandos del Step 1 y confirmar visualmente que todos los valores son únicos.

---

### Task 2: Escribir el `.env` con los valores nuevos

**Files:**
- Modify: `.env`

- [ ] **Step 1: Reemplazar el contenido completo del `.env`**

Escribir el archivo con los valores generados en Task 1. La estructura exacta (sustituir cada `<VALOR_GENERADO>` con el resultado del `openssl rand` correspondiente):

```bash
POSTGRES_DB=aerofinder
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<VALOR_GENERADO_hex32>
POSTGRES_APP_PASSWORD=<VALOR_GENERADO_hex32>
POSTGRES_WORKER_PASSWORD=<VALOR_GENERADO_hex32>
POSTGRES_AUDIT_PASSWORD=<VALOR_GENERADO_hex32>
MINIO_ROOT_USER=aerofinder_admin
MINIO_ROOT_PASSWORD=<VALOR_GENERADO_hex32>
MINIO_ACCESS_KEY=aerofinder_access
MINIO_SECRET_KEY=<VALOR_GENERADO_hex32>
MINIO_URL=http://minio:9000
MINIO_SECURE=false
MINIO_BUCKET_SNAPSHOTS=aerofinder-snapshots
MINIO_BUCKET_PHOTOS=aerofinder-photos
MINIO_BUCKET_VIDEOS=aerofinder-videos
SECRET_KEY=<VALOR_GENERADO_hex64>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ENVIRONMENT=development
BACKEND_CORS_ORIGINS=http://localhost:3000,http://192.168.100.213:3000
NEXT_PUBLIC_API_URL=http://192.168.100.213:8000
NEXT_PUBLIC_WS_URL=ws://192.168.100.213:8000
NEXT_PUBLIC_HLS_URL=http://192.168.100.213:8888
```

Nota: `MINIO_ROOT_USER` cambia de `minioadmin` (default conocido) a `aerofinder_admin`.

- [ ] **Step 2: Verificar que el `.env` no está siendo rastreado por git**

```bash
git status
```

Resultado esperado: `.env` NO debe aparecer en la lista. Si aparece como `modified`, significa que git lo está rastreando — en ese caso correr:

```bash
git rm --cached .env
```

- [ ] **Step 3: Confirmar que .gitignore cubre .env**

```bash
git check-ignore -v .env
```

Resultado esperado:
```
.gitignore:7:.env	.env
```

---

### Task 3: Crear `.env.example`

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Crear el archivo con placeholders documentados**

```bash
cat > .env.example << 'EOF'
# =============================================================================
# AEROFINDER — Configuración de entorno
# Copiar este archivo a .env y reemplazar todos los CHANGE_ME
#
# Generar secretos:
#   openssl rand -hex 32   → para passwords (64 caracteres)
#   openssl rand -hex 64   → para SECRET_KEY (128 caracteres)
#
# IMPORTANTE: .env nunca va al repositorio. Solo .env.example se commitea.
# =============================================================================

# ── PostgreSQL ─────────────────────────────────────────────────────────────
POSTGRES_DB=aerofinder
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
POSTGRES_APP_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
POSTGRES_WORKER_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
POSTGRES_AUDIT_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32

# ── MinIO (Object Storage) ─────────────────────────────────────────────────
# MINIO_ROOT_USER: elegir un nombre de admin custom, no usar "minioadmin"
MINIO_ROOT_USER=CHANGE_ME_custom_admin_username
MINIO_ROOT_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
MINIO_ACCESS_KEY=aerofinder_access
MINIO_SECRET_KEY=CHANGE_ME_generate_with_openssl_rand_hex_32
MINIO_URL=http://minio:9000
MINIO_SECURE=false
MINIO_BUCKET_SNAPSHOTS=aerofinder-snapshots
MINIO_BUCKET_PHOTOS=aerofinder-photos
MINIO_BUCKET_VIDEOS=aerofinder-videos

# ── JWT / Auth ─────────────────────────────────────────────────────────────
# SECRET_KEY: usar openssl rand -hex 64 (128 caracteres)
# Cambiar este valor invalida todos los tokens activos
SECRET_KEY=CHANGE_ME_generate_with_openssl_rand_hex_64
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ── Entorno ────────────────────────────────────────────────────────────────
ENVIRONMENT=development

# ── URLs (ajustar con la IP del servidor) ─────────────────────────────────
# Usar ./aerofinder.sh ip <nueva_ip> para actualizar todas las URLs a la vez
BACKEND_CORS_ORIGINS=http://localhost:3000,http://TU_IP:3000
NEXT_PUBLIC_API_URL=http://TU_IP:8000
NEXT_PUBLIC_WS_URL=ws://TU_IP:8000
NEXT_PUBLIC_HLS_URL=http://TU_IP:8888
EOF
```

- [ ] **Step 2: Verificar que `.env.example` tiene todos los campos del `.env`**

```bash
# Listar variables en .env (sin valores)
grep -oE '^[A-Z_]+' .env | sort

# Listar variables en .env.example
grep -oE '^[A-Z_]+' .env.example | sort
```

Resultado esperado: ambas listas idénticas.

- [ ] **Step 3: Commitear `.env.example`**

```bash
git add .env.example
git commit -m "feat: agregar .env.example con placeholders documentados"
```

---

### Task 4: Reset limpio de servicios Docker

**Files:**
- Sin cambios de código — operación Docker

- [ ] **Step 1: Detener todos los contenedores y borrar volúmenes**

```bash
docker compose down -v
```

Resultado esperado: todos los contenedores detenidos, volúmenes `aerofinder_postgres_data`, `aerofinder_minio_data`, etc. eliminados.

- [ ] **Step 2: Levantar servicios con las nuevas credenciales**

```bash
docker compose up -d
```

Docker lee `.env` automáticamente desde el directorio actual. Los contenedores de PostgreSQL y MinIO se inicializan con las nuevas credenciales.

- [ ] **Step 3: Esperar a que los servicios estén healthy (~30s)**

```bash
docker compose ps
```

Resultado esperado: todos los servicios en estado `healthy` o `running`. Si alguno muestra `Exit`, revisar logs:

```bash
docker compose logs <servicio>
```

---

### Task 5: Verificar sistema completo

**Files:**
- Sin cambios

- [ ] **Step 1: Verificar estado de todos los servicios**

```bash
./aerofinder.sh status
```

Resultado esperado: todos los endpoints respondiendo (backend :8000, frontend :3000, MinIO :9001).

- [ ] **Step 2: Verificar login con credenciales admin**

```bash
curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aerofinder.local","password":"AeroAdmin2024!"}' \ # pragma: allowlist secret
  | python3 -m json.tool
```

Resultado esperado: respuesta JSON con `access_token`.

> Nota: si el seed del admin no se corrió automáticamente, ejecutar el script de seed del backend o insertarlo manualmente según las instrucciones en `CLAUDE.md` sección "Credenciales admin por defecto".

- [ ] **Step 3: Verificar que las credenciales viejas no funcionan**

```bash
# Intentar conectar a postgres con la password vieja (debe fallar)
docker compose exec postgres psql -U postgres -c "SELECT 1;" 2>&1
```

El comando usa la password del entorno actual (nueva). Si se quiere verificar que la vieja no funciona, intentar con `PGPASSWORD=17d5d54b47972b25ef2305c4 psql ...` — debe retornar `authentication failed`.

- [ ] **Step 4: Verificar que .env está fuera de git**

```bash
git status
git log --all --oneline -- .env | head -5
```

Resultado esperado:
- `git status`: `.env` no aparece
- `git log`: muestra commits anteriores (el histórico) pero el archivo no existe en HEAD — esto es correcto y esperado

---

## Criterios de éxito del plan completo

- [ ] `.env` no aparece en `git status`
- [ ] `git check-ignore -v .env` confirma que está ignorado
- [ ] `.env.example` commiteado con todos los campos y sin valores reales
- [ ] `POSTGRES_AUDIT_PASSWORD` es distinto de `POSTGRES_WORKER_PASSWORD`
- [ ] `MINIO_ROOT_USER` no es `minioadmin`
- [ ] `./aerofinder.sh status` muestra todos los servicios healthy
- [ ] Login con `admin@aerofinder.local` retorna un JWT válido
