#!/usr/bin/env bash
# =============================================================================
# AEROFINDER — Script de operación unificado
# Uso: ./scripts/aerofinder.sh <comando> [opciones]
#
# Comandos:
#   start  [--rebuild] [--no-wait]   Levantar todos los servicios
#   stop   [--volumes]               Apagar (--volumes elimina datos)
#   restart [servicio...]            Reiniciar uno o todos los servicios
#   status                           Estado y salud de los servicios
#   logs   [servicio] [-f]           Ver logs (por defecto: backend ai-worker)
#   ip     <nueva_ip>               Actualizar IP pública en .env y DB
#   health                           Verificar endpoints HTTP del sistema
# =============================================================================
set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err()  { echo -e "${RED}✗ ERROR:${RESET} $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ── Rutas ─────────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ── Ayuda ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF

${BOLD}AEROFINDER — Control del sistema${RESET}

  ${CYAN}./scripts/aerofinder.sh start${RESET}  [--rebuild] [--no-wait]
      Levanta todos los servicios. --rebuild fuerza reconstrucción de imágenes.
      --no-wait no espera a que el backend esté healthy.

  ${CYAN}./scripts/aerofinder.sh stop${RESET}   [--volumes]
      Apaga los contenedores. --volumes elimina también los volúmenes de datos.

  ${CYAN}./scripts/aerofinder.sh restart${RESET} [servicio ...]
      Reinicia uno o más servicios (ej: backend ai-worker).
      Sin argumentos reinicia todo.

  ${CYAN}./scripts/aerofinder.sh status${RESET}
      Muestra el estado y health de cada contenedor.

  ${CYAN}./scripts/aerofinder.sh logs${RESET}   [servicio] [-f]
      Tail de logs. Servicios: postgres redis minio mediamtx backend ai-worker frontend.
      Sin servicio muestra backend + ai-worker. -f sigue en tiempo real.

  ${CYAN}./scripts/aerofinder.sh ip${RESET}     <nueva_ip>
      Actualiza NEXT_PUBLIC_* y BACKEND_CORS_ORIGINS en .env,
      y rtmp.base_url en la DB. Reconstruye frontend y backend.

  ${CYAN}./scripts/aerofinder.sh health${RESET}
      Verifica los endpoints HTTP clave del sistema.

EOF
  exit 0
}

# ── Prerequisitos ─────────────────────────────────────────────────────────────
check_prerequisites() {
  command -v docker >/dev/null 2>&1 || err "Docker no encontrado. Instalar Docker primero."
  docker compose version >/dev/null 2>&1 || err "Docker Compose v2 no encontrado (necesita 'docker compose', no 'docker-compose')."

  # GPU opcional — solo advertir si no está
  if ! command -v nvidia-smi >/dev/null 2>&1; then
    warn "nvidia-smi no encontrado — el ai-worker puede fallar sin GPU NVIDIA."
  fi
}

# ── .env ──────────────────────────────────────────────────────────────────────
ensure_env() {
  if [ -f .env ]; then
    ok ".env encontrado."
    return
  fi

  if [ -f .env.example ]; then
    info "Copiando .env.example → .env ..."
    cp .env.example .env
    warn ".env creado desde .env.example. Revisá las contraseñas antes de producción."
  else
    info "Generando .env mínimo con secretos aleatorios..."
    local secret_key postgres_pass app_pass worker_pass minio_root_pass minio_secret

    secret_key=$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets;print(secrets.token_hex(32))')
    postgres_pass=$(openssl rand -hex 12 2>/dev/null || python3 -c 'import secrets;print(secrets.token_hex(12))')
    app_pass=$(openssl rand -hex 12 2>/dev/null || python3 -c 'import secrets;print(secrets.token_hex(12))')
    worker_pass=$(openssl rand -hex 12 2>/dev/null || python3 -c 'import secrets;print(secrets.token_hex(12))')
    minio_root_pass=$(openssl rand -hex 12 2>/dev/null || python3 -c 'import secrets;print(secrets.token_hex(12))')
    minio_secret=$(openssl rand -hex 12 2>/dev/null || python3 -c 'import secrets;print(secrets.token_hex(12))')

    cat > .env <<ENVEOF
POSTGRES_DB=aerofinder
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${postgres_pass}
POSTGRES_APP_PASSWORD=${app_pass}
POSTGRES_WORKER_PASSWORD=${worker_pass}
POSTGRES_AUDIT_PASSWORD=${worker_pass}
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=${minio_root_pass}
MINIO_ACCESS_KEY=aerofinder_access
MINIO_SECRET_KEY=${minio_secret}
MINIO_URL=http://minio:9000
MINIO_SECURE=false
MINIO_BUCKET_SNAPSHOTS=aerofinder-snapshots
MINIO_BUCKET_PHOTOS=aerofinder-photos
MINIO_BUCKET_VIDEOS=aerofinder-videos
SECRET_KEY=${secret_key}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ENVIRONMENT=development
BACKEND_CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_HLS_URL=http://localhost:8888
ENVEOF
    ok ".env generado con secretos aleatorios."
  fi
}

# ── Detectar IP local ─────────────────────────────────────────────────────────
detect_local_ip() {
  # Intenta la IP de la interfaz principal (la que tiene ruta default)
  local ip
  ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
  if [ -z "$ip" ]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  echo "${ip:-127.0.0.1}"
}

# ── Verificar IP configurada vs IP actual ─────────────────────────────────────
check_ip_mismatch() {
  local current_ip configured_ip
  current_ip=$(detect_local_ip)
  configured_ip=$(grep '^SERVER_HOST=' .env 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "")

  # Si no hay SERVER_HOST o es localhost, actualizar sin preguntar
  if [ -z "$configured_ip" ] || [ "$configured_ip" = "localhost" ] || [ "$configured_ip" = "127.0.0.1" ]; then
    info "SERVER_HOST no configurado — aplicando IP detectada: ${current_ip}"
    cmd_ip "$current_ip"
    return
  fi

  # Si la IP no cambió, no hay nada que hacer
  if [ "$configured_ip" = "$current_ip" ]; then
    ok "IP del servidor: ${current_ip} (sin cambios)"
    return
  fi

  # IP cambió — actualizar automáticamente sin preguntar
  warn "IP cambió: ${configured_ip} → ${current_ip}. Actualizando automáticamente..."
  cmd_ip "$current_ip"
}

# ── Esperar backend ───────────────────────────────────────────────────────────
wait_for_backend() {
  local url="http://localhost:8000/health"
  info "Esperando backend en ${url} ..."
  local i=0
  while [ $i -lt 90 ]; do
    if curl -sSf "$url" >/dev/null 2>&1; then
      ok "Backend healthy."
      return 0
    fi
    printf "."
    sleep 2
    i=$((i + 1))
  done
  echo ""
  warn "Backend no respondió después de 3 minutos. Revisá: docker compose logs backend"
  return 1
}

# ── minio-init (one-shot) ─────────────────────────────────────────────────────
run_minio_init() {
  # Solo correr si minio-init no completó todavía (no hay estado "exited 0")
  local state
  state=$(docker compose ps minio-init --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State',''))" 2>/dev/null || echo "")
  if [ "$state" != "exited" ]; then
    info "Ejecutando minio-init para crear buckets y usuario ..."
    docker compose run --rm minio-init 2>/dev/null && ok "minio-init completado." || warn "minio-init falló o ya estaba hecho."
  else
    ok "minio-init ya fue ejecutado anteriormente."
  fi
}

# ── Mostrar resumen de acceso ─────────────────────────────────────────────────
print_access_summary() {
  local ip
  ip=$(detect_local_ip)

  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║           AEROFINDER — Sistema en línea                  ║${RESET}"
  echo -e "${BOLD}╠══════════════════════════════════════════════════════════╣${RESET}"
  echo -e "${BOLD}║${RESET}  Panel web     ${GREEN}http://${ip}:3000${RESET}"
  echo -e "${BOLD}║${RESET}  API / docs    ${CYAN}http://${ip}:8000/docs${RESET}"
  echo -e "${BOLD}║${RESET}  MinIO console ${CYAN}http://${ip}:9001${RESET}"
  echo -e "${BOLD}║${RESET}  RTMP dron     ${YELLOW}rtmp://${ip}:1935/<SERIAL_DRON>${RESET}"
  echo -e "${BOLD}║${RESET}  HLS video     ${CYAN}http://${ip}:8888/<SERIAL_DRON>/index.m3u8${RESET}"
  echo -e "${BOLD}╠══════════════════════════════════════════════════════════╣${RESET}"
  echo -e "${BOLD}║${RESET}  Admin email   admin@aerofinder.local"
  echo -e "${BOLD}║${RESET}  Admin pass    AeroAdmin2024!"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "${BOLD}  ┌─────────────────────────────────────────────────────┐${RESET}"
  echo -e "${BOLD}  │  COMPARTIR CON USUARIOS (abrir en cualquier celular) │${RESET}"
  echo -e "${BOLD}  │                                                       │${RESET}"
  echo -e "${BOLD}  │   ${GREEN}http://${ip}:3000/connect${RESET}${BOLD}                      │${RESET}"
  echo -e "${BOLD}  │                                                       │${RESET}"
  echo -e "${BOLD}  │   Muestra QR + link de acceso + URL del dron          │${RESET}"
  echo -e "${BOLD}  └─────────────────────────────────────────────────────┘${RESET}"
  echo ""
  echo -e "  Logs en tiempo real: ${CYAN}./scripts/aerofinder.sh logs -f${RESET}"
  echo -e "  Estado:              ${CYAN}./scripts/aerofinder.sh status${RESET}"
  echo ""
}

# =============================================================================
# COMANDOS
# =============================================================================

cmd_start() {
  local rebuild=0 no_wait=0
  for arg in "$@"; do
    case "$arg" in
      --rebuild)  rebuild=1 ;;
      --no-wait)  no_wait=1 ;;
      -h|--help)  usage ;;
    esac
  done

  step "Verificando prerequisitos"
  check_prerequisites
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

  step "Configuración"
  ensure_env

  step "Verificando IP del servidor"
  check_ip_mismatch

  step "Levantando servicios"
  if [ $rebuild -eq 1 ]; then
    info "Reconstruyendo imágenes Docker ..."
    docker compose build --parallel
  fi

  info "Iniciando contenedores ..."
  docker compose up -d

  step "Inicializando MinIO"
  run_minio_init

  if [ $no_wait -eq 0 ]; then
    step "Verificando salud del sistema"
    wait_for_backend || true
  fi

  step "Sistema listo"
  print_access_summary
}

cmd_stop() {
  local volumes=0
  for arg in "$@"; do
    case "$arg" in
      --volumes) volumes=1 ;;
      -h|--help) usage ;;
    esac
  done

  if [ $volumes -eq 1 ]; then
    warn "Se eliminarán todos los volúmenes (datos de Postgres, MinIO, Redis)."
    read -rp "¿Confirmar? [s/N] " confirm
    [[ "$confirm" =~ ^[sS]$ ]] || { info "Cancelado."; exit 0; }
    info "Apagando y eliminando volúmenes ..."
    docker compose down -v
  else
    info "Apagando servicios (los datos se conservan) ..."
    docker compose down
  fi
  ok "Sistema apagado."
}

cmd_restart() {
  if [ $# -eq 0 ]; then
    info "Reiniciando todos los servicios ..."
    docker compose restart
  else
    info "Reiniciando: $*"
    docker compose restart "$@"
  fi
  ok "Reinicio completado."
  docker compose ps
}

cmd_status() {
  step "Estado de contenedores"
  docker compose ps

  step "Verificando endpoints"
  local host="localhost"
  local checks=(
    "Backend API|http://${host}:8000/health"
    "Frontend  |http://${host}:3000"
    "MinIO API |http://${host}:9000/minio/health/live"
    "HLS server|http://${host}:8888"
  )

  for entry in "${checks[@]}"; do
    local label url status
    label="${entry%%|*}"
    url="${entry##*|}"
    if curl -sSf --max-time 3 "$url" >/dev/null 2>&1; then
      status="${GREEN}UP${RESET}"
    else
      status="${RED}DOWN${RESET}"
    fi
    printf "  %-14s %b  %s\n" "$label" "$status" "$url"
  done
  echo ""
}

cmd_logs() {
  local follow=0
  local services=()

  for arg in "$@"; do
    case "$arg" in
      -f|--follow) follow=1 ;;
      -*) warn "Opción desconocida: $arg" ;;
      *)  services+=("$arg") ;;
    esac
  done

  # Por defecto mostrar backend y ai-worker
  if [ ${#services[@]} -eq 0 ]; then
    services=(backend ai-worker)
  fi

  if [ $follow -eq 1 ]; then
    docker compose logs -f --tail=50 "${services[@]}"
  else
    docker compose logs --tail=100 "${services[@]}"
  fi
}

cmd_ip() {
  local new_ip="${1:-}"
  [ -z "$new_ip" ] && err "Uso: aerofinder.sh ip <nueva_ip>"

  step "Actualizando IP a ${new_ip}"

  [ -f .env ] || err ".env no encontrado."

  # Actualizar variables en .env
  sed -i \
    -e "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${new_ip}:8000|" \
    -e "s|NEXT_PUBLIC_WS_URL=.*|NEXT_PUBLIC_WS_URL=ws://${new_ip}:8000|" \
    -e "s|NEXT_PUBLIC_HLS_URL=.*|NEXT_PUBLIC_HLS_URL=http://${new_ip}:8888|" \
    -e "s|BACKEND_CORS_ORIGINS=.*|BACKEND_CORS_ORIGINS=http://localhost:3000,http://${new_ip}:3000|" \
    -e "s|SERVER_HOST=.*|SERVER_HOST=${new_ip}|" \
    .env
  ok ".env actualizado."

  # Actualizar rtmp.base_url en la DB (si postgres está corriendo)
  if docker compose ps postgres --format json 2>/dev/null | grep -q '"State":"running"'; then
    local pg_db
    pg_db=$(grep '^POSTGRES_DB=' .env | cut -d= -f2 | tr -d '"' || echo "aerofinder")
    docker compose exec -T postgres psql -U postgres -d "$pg_db" \
      -c "UPDATE system_config SET value_text = 'rtmp://${new_ip}:1935' WHERE config_key = 'rtmp.base_url';" \
      && ok "system_config.rtmp.base_url actualizado en DB." \
      || warn "No se pudo actualizar la DB — hacerlo manualmente cuando postgres esté corriendo."
  else
    warn "postgres no está corriendo — actualizá rtmp.base_url en la DB manualmente."
  fi

  # Reconstruir frontend y backend con nueva IP
  info "Reconstruyendo frontend y backend con nueva IP ..."
  docker compose up -d --build frontend backend
  ok "Listo. Nueva IP: ${new_ip}"
  echo ""
  echo -e "  Panel web: ${GREEN}http://${new_ip}:3000${RESET}"
  echo -e "  RTMP dron: ${YELLOW}rtmp://${new_ip}:1935/<SERIAL_DRON>${RESET}"
  echo ""
}

cmd_health() {
  step "Health check del sistema"
  local host="localhost"
  local failed=0

  check_endpoint() {
    local label="$1" url="$2" expected_code="${3:-200}"
    local code
    code=$(curl -sSo /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    if [ "$code" = "$expected_code" ] || [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "307" ]; then
      ok "$(printf '%-20s' "$label") ${code} ${CYAN}${url}${RESET}"
    else
      echo -e "${RED}✗${RESET} $(printf '%-20s' "$label") ${RED}${code}${RESET} ${url}"
      failed=$((failed + 1))
    fi
  }

  check_endpoint "Backend /health"  "http://${host}:8000/health"
  check_endpoint "Backend /docs"    "http://${host}:8000/docs"
  check_endpoint "Frontend"         "http://${host}:3000"
  check_endpoint "MinIO health"     "http://${host}:9000/minio/health/live"
  check_endpoint "MinIO console"    "http://${host}:9001"
  check_endpoint "HLS server"       "http://${host}:8888"

  echo ""
  if [ $failed -eq 0 ]; then
    ok "Todos los endpoints responden correctamente."
  else
    warn "${failed} endpoint(s) no responden — revisá los logs con: ./scripts/aerofinder.sh logs -f"
  fi
}

# =============================================================================
# DISPATCH
# =============================================================================
COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  start)   cmd_start "$@" ;;
  stop)    cmd_stop "$@" ;;
  restart) cmd_restart "$@" ;;
  status)  cmd_status ;;
  logs)    cmd_logs "$@" ;;
  ip)      cmd_ip "$@" ;;
  health)  cmd_health ;;
  -h|--help|help) usage ;;
  *) err "Comando desconocido: '${COMMAND}'. Usar --help para ver la ayuda." ;;
esac
