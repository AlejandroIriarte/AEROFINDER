# Auth Bug Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir 8 bugs de auth/sesión/navegación encontrados en auditoría, incluyendo el spinner eterno post-logout y guards faltantes.

**Architecture:** Todos los cambios están en el frontend. El Zustand store (`auth.ts`) acumula la mayoría de los bugs — flags de estado mal gestionados, setters incompletos, y falta de coordinación entre efectos. Las páginas de login/register y el PWA layout son los consumidores afectados.

**Tech Stack:** Next.js 14 App Router, Zustand, js-cookie, TypeScript.

---

## Archivos modificados

| Archivo | Bugs resueltos |
|---|---|
| `frontend/src/store/auth.ts` | BUG-1, BUG-6, BUG-9 |
| `frontend/src/app/login/page.tsx` | BUG-3, BUG-4 |
| `frontend/src/app/register/page.tsx` | BUG-5, BUG-11 |
| `frontend/src/app/app/layout.tsx` | BUG-10 |

---

## Task 1: Fix auth.ts — logout, loadUser race, setAccessToken

**Archivo:** `frontend/src/store/auth.ts`

Tres bugs en el mismo archivo:

**BUG-6** — `logout()` setea `isInitialized: false`. El `useEffect` de redirect en InnerLayout requiere `isInitialized === true` para disparar. Con `false`, ningún efecto redirige y el spinner queda eterno.
**Fix:** Cambiar a `isInitialized: true` en logout — sabemos el estado (sin sesión), es información válida.

**BUG-1** — `loadUser()` no setea `isLoading: true` hasta la línea 164, después de `await doRefresh()`. Durante ese await, una segunda llamada concurrent pasa el guard (`isLoading` aún es `false`).
**Fix:** Setear `isLoading: true` al inicio de `loadUser()` antes de cualquier `await`.

**BUG-9** — `setAccessToken()` (llamado por el interceptor de axios cuando renueva el token) no persiste en `localStorage`. La próxima recarga de página encuentra el token viejo, llama `/me` → 401 → refresh innecesario.
**Fix:** Agregar `localStorage.setItem(TOKEN_KEY, token)` en `setAccessToken()`.

- [ ] **Paso 1: Leer el archivo actual**

```bash
# Leer para confirmar líneas exactas
# frontend/src/store/auth.ts
```

- [ ] **Paso 2: Fix BUG-6 — cambiar isInitialized en logout()**

Encontrar en `logout()` (cerca de línea 100-107):
```typescript
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
        isInitialized:   false,
      });
```

Reemplazar con:
```typescript
      set({
        user:            null,
        accessToken:     null,
        isAuthenticated: false,
        isLoading:       false,
        isInitialized:   true,
      });
```

- [ ] **Paso 3: Fix BUG-1 — setear isLoading al inicio de loadUser()**

Al inicio de `loadUser()`, después del guard `if (get().isInitialized || get().isLoading) return;`, agregar inmediatamente:

```typescript
    set({ isLoading: true });
```

El bloque debe quedar:
```typescript
  loadUser: async () => {
    if (get().isInitialized || get().isLoading) return;

    set({ isLoading: true });

    const { refreshToken: doRefresh } = get() as AuthState & {
      refreshToken: () => Promise<boolean>;
    };

    let { accessToken } = get();
    // ... resto igual
```

IMPORTANTE: Como ahora `isLoading: true` se setea al inicio, el `set({ isLoading: true })` de la línea ~164 (antes del try de `/me`) se convierte en duplicado. Quitarlo.

- [ ] **Paso 4: Fix BUG-9 — setAccessToken() persiste en localStorage**

Encontrar `setAccessToken`:
```typescript
  setAccessToken: (token: string) => {
    set({ accessToken: token, isAuthenticated: true });
  },
```

Reemplazar con:
```typescript
  setAccessToken: (token: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, token);
    }
    set({ accessToken: token, isAuthenticated: true });
  },
```

- [ ] **Paso 5: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```
Esperado: `✓ Compiled successfully`

- [ ] **Paso 6: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/store/auth.ts
git commit -m "fix: auth store — logout no resetea isInitialized, loadUser setea isLoading inmediatamente, setAccessToken persiste localStorage"
```

---

## Task 2: Fix login/page.tsx — ?next= redirect + guard si ya autenticado

**Archivo:** `frontend/src/app/login/page.tsx`

**BUG-3** — `handleSubmit` siempre hace `router.replace("/dashboard")` ignorando el query param `?next=` que el middleware pone.
**Fix:** Leer `searchParams.get("next")` y redirigir ahí si existe (validando que sea ruta interna).

**BUG-4** — La página de login no tiene guard. Un usuario ya autenticado puede navegar a `/login` y ver el formulario.
**Fix:** Agregar `useEffect` que redirija a `/dashboard` (o `?next=`) si `isAuthenticated && isInitialized`.

- [ ] **Paso 1: Leer el archivo actual**

```bash
# frontend/src/app/login/page.tsx — leer completo
```

- [ ] **Paso 2: Agregar import de useAuthStore y guard de autenticación**

El archivo ya importa `useAuthStore`. Agregar `useEffect` al componente `LoginPage` (después de los useState existentes):

```typescript
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized   = useAuthStore((s) => s.isInitialized);

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      const next = searchParams.get("next");
      const dest = next && next.startsWith("/") ? next : "/dashboard";
      router.replace(dest);
    }
  }, [isInitialized, isAuthenticated, router, searchParams]);
```

- [ ] **Paso 3: Fix handleSubmit para respetar ?next=**

Encontrar en `handleSubmit`:
```typescript
      router.replace("/dashboard");
```

Reemplazar con:
```typescript
      const next = searchParams.get("next");
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      router.replace(dest);
```

- [ ] **Paso 4: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```

- [ ] **Paso 5: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/login/page.tsx
git commit -m "fix: login respeta ?next= query param y redirige si ya autenticado"
```

---

## Task 3: Fix register/page.tsx — guard + isLoading local

**Archivo:** `frontend/src/app/register/page.tsx`

**BUG-5** — No hay guard: usuario autenticado puede ver el formulario de registro.
**Fix:** Igual que BUG-4.

**BUG-11** — Usa `isLoading` global del store (compartido con `loadUser()`). Si `loadUser()` está corriendo, el botón de submit queda deshabilitado sin razón.
**Fix:** Reemplazar `isLoading` del store por un estado local `const [isSubmitting, setIsSubmitting] = useState(false)`.

- [ ] **Paso 1: Leer el archivo actual**

```bash
# frontend/src/app/register/page.tsx — leer completo
```

- [ ] **Paso 2: Quitar isLoading del store, agregar estado local**

Encontrar:
```typescript
  const { register, isLoading } = useAuthStore();
```

Reemplazar con:
```typescript
  const { register }        = useAuthStore();
  const isAuthenticated     = useAuthStore((s) => s.isAuthenticated);
  const isInitialized       = useAuthStore((s) => s.isInitialized);
  const [isSubmitting, setIsSubmitting] = useState(false);
```

- [ ] **Paso 3: Agregar guard de autenticación**

Después de los `useState` existentes, agregar:

```typescript
  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isInitialized, isAuthenticated, router]);
```

Asegurarse de que `useRouter` y `useEffect` estén importados (ya lo están).

- [ ] **Paso 4: Reemplazar isLoading por isSubmitting en handleSubmit y JSX**

En `handleSubmit`:
```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await register(email, password, fullName, phone || undefined);
      // ...
    } catch (error: unknown) {
      // ...
    }
  };
```

Reemplazar con:
```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await register(email, password, fullName, phone || undefined);
      // ...
    } catch (error: unknown) {
      // ...
    } finally {
      setIsSubmitting(false);
    }
  };
```

En el JSX, reemplazar todas las referencias a `isLoading` por `isSubmitting` (el botón de submit).

- [ ] **Paso 5: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```

- [ ] **Paso 6: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/register/page.tsx
git commit -m "fix: register redirige si autenticado, usa isSubmitting local en vez de isLoading global"
```

---

## Task 4: Fix app/layout.tsx — auth guard para PWA rescatistas

**Archivo:** `frontend/src/app/app/layout.tsx`

**BUG-10** — El layout de `/app/*` (PWA para rescatistas en campo) no tiene protección de autenticación client-side. Solo el middleware (que checa la cookie) lo protege. Si la cookie existe pero el token es inválido, las páginas hijas hacen requests autenticados que devuelven 401 en cascada sin redirect a login.

**Fix:** Convertir a `"use client"`, agregar `useAuthStore`, guard de autenticación idéntico al de `InnerLayout` (dashboard).

- [ ] **Paso 1: Leer el archivo actual**

```bash
# frontend/src/app/app/layout.tsx — leer completo
```

- [ ] **Paso 2: Convertir a client component con guard de auth**

El nuevo `layout.tsx` debe:
1. Tener `"use client"` al inicio
2. Usar `useAuthStore` para leer `isAuthenticated`, `isInitialized`, `isLoading`, `loadUser`
3. Llamar `loadUser()` en `useEffect` si no está inicializado
4. Redirigir a `/login` si `isInitialized && !isLoading && !isAuthenticated`
5. Mostrar spinner mientras carga (igual que InnerLayout)
6. Preservar el JSX existente del layout (header, children, etc.)

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router          = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading       = useAuthStore((s) => s.isLoading);
  const isInitialized   = useAuthStore((s) => s.isInitialized);
  const loadUser        = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    if (!isInitialized) loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isInitialized && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isLoading, isAuthenticated, router]);

  if (!isInitialized || isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-slate-400">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />
          <p className="text-sm">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  return (
    // PRESERVAR EL JSX EXISTENTE DEL LAYOUT AQUÍ
    // leer el archivo original y mantener el contenido del return
    <>{children}</>
  );
}
```

**IMPORTANTE:** Leer el archivo actual primero. Preservar exactamente el JSX existente dentro del return final — solo agregar el guard por encima. Si el layout actual tiene un header, nav, o cualquier wrapper, mantenerlo.

- [ ] **Paso 3: Verificar build**

```bash
cd /home/wiz/aerofinder/frontend && npm run build 2>&1 | grep -E "error TS|✓ Compiled|Failed" | tail -5
```

- [ ] **Paso 4: Commit**

```bash
cd /home/wiz/aerofinder
git add frontend/src/app/app/layout.tsx
git commit -m "fix: PWA layout /app/* agrega guard de autenticacion client-side"
```
