# Spec: Rotación de credenciales y seguridad del .env

**Fecha:** 2026-05-22  
**Alcance:** Rotación completa de secretos expuestos en historial git + establecer `.env.example` como fuente de verdad documentada

---

## Contexto

El archivo `.env` fue commiteado en git y luego eliminado. Aunque el archivo ya no está en HEAD, el historial preserva las credenciales. La solución estándar es rotar todos los secretos (las credenciales en historial quedan inútiles) y garantizar que `.env` nunca vuelva a git.

El entorno es desarrollo sin datos importantes → se usa `docker-compose down -v` para reset limpio.

---

## Credenciales a rotar

| Variable | Generación | Notas |
|---|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Superusuario postgres |
| `POSTGRES_APP_PASSWORD` | `openssl rand -hex 32` | Usuario aerofinder_app |
| `POSTGRES_WORKER_PASSWORD` | `openssl rand -hex 32` | Usuario aerofinder_worker |
| `POSTGRES_AUDIT_PASSWORD` | `openssl rand -hex 32` | Fix: actualmente igual que WORKER — deben ser distintos |
| `MINIO_ROOT_USER` | valor custom (no `minioadmin`) | Cambiar el default conocido |
| `MINIO_ROOT_PASSWORD` | `openssl rand -hex 32` | |
| `MINIO_SECRET_KEY` | `openssl rand -hex 32` | Credencial app MinIO |
| `SECRET_KEY` | `openssl rand -hex 64` | JWT HS256 — invalida todos los tokens activos |

**Total: 8 secretos rotados.**

---

## Flujo de implementación

```
1. Generar 8 secretos nuevos (openssl rand)
2. Escribir .env con valores nuevos
3. Crear .env.example con placeholders documentados
4. docker-compose down -v        ← borra volúmenes, datos de prueba, credenciales viejas en DB/MinIO
5. docker-compose up -d          ← levanta limpio con credenciales nuevas
6. Verificar que servicios responden (./aerofinder.sh status)
```

---

## Estructura del `.env.example`

```bash
# =============================================================================
# AEROFINDER — Configuración de entorno
# Copiar este archivo a .env y reemplazar todos los CHANGE_ME
# Generar secretos: openssl rand -hex 32   (para passwords)
#                   openssl rand -hex 64   (para SECRET_KEY)
# =============================================================================

# ── PostgreSQL ─────────────────────────────────────────────────────────────
POSTGRES_DB=aerofinder
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
POSTGRES_APP_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
POSTGRES_WORKER_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32
POSTGRES_AUDIT_PASSWORD=CHANGE_ME_generate_with_openssl_rand_hex_32

# ── MinIO (Object Storage) ─────────────────────────────────────────────────
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
SECRET_KEY=CHANGE_ME_generate_with_openssl_rand_hex_64
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ── Entorno ────────────────────────────────────────────────────────────────
ENVIRONMENT=development

# ── URLs (ajustar con la IP del servidor) ─────────────────────────────────
# Usar ./aerofinder.sh ip <nueva_ip> para actualizar todas a la vez
BACKEND_CORS_ORIGINS=http://localhost:3000,http://TU_IP:3000
NEXT_PUBLIC_API_URL=http://TU_IP:8000
NEXT_PUBLIC_WS_URL=ws://TU_IP:8000
NEXT_PUBLIC_HLS_URL=http://TU_IP:8888
```

---

## `.gitignore`

Ya está correcto:
```
.env
.env.*
!.env.example
```
Sin cambios necesarios.

---

## Criterios de éxito

- `git status` no muestra `.env` como archivo rastreado
- `git log --all -- .env` muestra commits viejos pero el archivo no existe en HEAD
- Todos los servicios levantan con `./aerofinder.sh status` mostrando healthy
- Las credenciales del historial git ya no funcionan en ningún servicio
- `.env.example` está commiteado y documentado
