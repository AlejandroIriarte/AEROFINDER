#!/usr/bin/env bash
# =============================================================================
# AEROFINDER — Script de instalación completa
# Ubuntu 24.04 Noble + GPU NVIDIA (driver ya instalado en el host)
#
# Uso:
#   chmod +x setup.sh && ./setup.sh
#
# Requisito previo: nvidia-smi debe funcionar en el host.
# =============================================================================

set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Funciones de logging ──────────────────────────────────────────────────────

log_step() {
  echo -e "\n${CYAN}${BOLD}[$(date '+%H:%M:%S')] ▶ $*${RESET}"
}

log_ok() {
  echo -e "${GREEN}  ✓ $*${RESET}"
}

log_warn() {
  echo -e "${YELLOW}  ⚠ $*${RESET}"
}

log_info() {
  echo -e "  → $*"
}

error_exit() {
  echo -e "\n${RED}${BOLD}  ✗ ERROR: $*${RESET}\n" >&2
  exit 1
}

# ── Directorio raíz del proyecto ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# =============================================================================
# SECCIÓN 1 — Verificaciones previas
# =============================================================================

log_step "SECCIÓN 1: Verificaciones previas"

# 1.1 No ejecutar como root
if [[ "$EUID" -eq 0 ]]; then
  error_exit "No ejecutes este script como root. Usa tu usuario normal con sudo disponible."
fi
log_ok "Usuario: $USER (no root)"

# 1.2 Ubuntu 24.04
if command -v lsb_release &>/dev/null; then
  UBUNTU_VERSION="$(lsb_release -rs)"
  if [[ "$UBUNTU_VERSION" != "24.04" ]]; then
    error_exit "Se requiere Ubuntu 24.04 Noble. Versión detectada: ${UBUNTU_VERSION}"
  fi
  log_ok "Ubuntu ${UBUNTU_VERSION} Noble detectado"
else
  error_exit "No se pudo verificar la versión de Ubuntu (lsb_release no encontrado)."
fi

# 1.3 GPU NVIDIA disponible
if ! command -v nvidia-smi &>/dev/null; then
  error_exit "nvidia-smi no encontrado. Instala los drivers NVIDIA antes de continuar."
fi
if ! nvidia-smi &>/dev/null; then
  error_exit "nvidia-smi no pudo comunicarse con la GPU. Verifica la instalación del driver."
fi
GPU_NAME="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | xargs)"
log_ok "GPU detectada: ${GPU_NAME}"

# 1.4 Verificar .env
if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    echo -e "\n${YELLOW}${BOLD}  ⚠ ATENCIÓN: Se creó el archivo .env desde .env.example.${RESET}"
    echo -e "${YELLOW}  Debes completar las variables marcadas con 'cambiar_en_produccion'${RESET}"
    echo -e "${YELLOW}  antes de ejecutar el sistema en producción.${RESET}"
    echo -e "${YELLOW}  Para continuar la instalación en modo desarrollo, vuelve a${RESET}"
    echo -e "${YELLOW}  ejecutar: ./setup.sh${RESET}\n"
    exit 1
  else
    error_exit ".env y .env.example no encontrados. ¿Estás en el directorio correcto?"
  fi
fi
log_ok "Archivo .env encontrado"

# 1.5 Verificar SECRET_KEY y auto-generar si tiene placeholder
PLACEHOLDER="cambiar_en_produccion_min_32_chars"
CURRENT_SECRET="$(grep '^SECRET_KEY=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")"

if [[ -z "$CURRENT_SECRET" ]] || [[ "$CURRENT_SECRET" == *"${PLACEHOLDER}"* ]]; then
  log_warn "SECRET_KEY tiene el valor placeholder. Generando uno seguro automáticamente..."
  if ! command -v python3 &>/dev/null; then
    error_exit "python3 no encontrado. No se puede generar SECRET_KEY."
  fi
  NEW_SECRET="$(python3 -c "import secrets; print(secrets.token_hex(32))")"
  # Reemplazar la línea completa de SECRET_KEY en .env
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${NEW_SECRET}|" .env
  log_ok "SECRET_KEY generado y guardado en .env"
else
  log_ok "SECRET_KEY configurado correctamente"
fi

# =============================================================================
# SECCIÓN 2 — Instalación de dependencias del sistema
# =============================================================================

log_step "SECCIÓN 2: Instalación de dependencias del sistema"

# ── 2a) Docker Engine + Docker Compose v2 ────────────────────────────────────

if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  DOCKER_VER="$(docker --version | awk '{print $3}' | tr -d ',')"
  COMPOSE_VER="$(docker compose version --short 2>/dev/null || echo '?')"
  log_ok "Docker ${DOCKER_VER} ya instalado (Compose ${COMPOSE_VER})"
else
  log_info "Instalando Docker Engine desde el repositorio oficial (Ubuntu Noble)..."

  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    ca-certificates curl gnupg

  # Repositorio oficial de Docker para Ubuntu Noble (24.04)
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  log_ok "Docker instalado"
fi

# Agregar usuario al grupo docker si no está ya
if ! groups "$USER" | grep -q '\bdocker\b'; then
  log_info "Agregando $USER al grupo docker..."
  sudo usermod -aG docker "$USER"
  log_warn "Usuario añadido al grupo docker. Los cambios aplican en esta sesión via newgrp."
else
  log_ok "Usuario $USER ya pertenece al grupo docker"
fi

# Asegurar que el daemon Docker está corriendo
if ! sudo systemctl is-active --quiet docker; then
  log_info "Iniciando Docker daemon..."
  sudo systemctl start docker
fi

# Ejecutar docker como el usuario actual usando sg si no está en el grupo aún
# (evita pedir logout/login)
if ! docker info &>/dev/null 2>&1; then
  # Intentar con sg docker para aplicar el grupo en esta sesión
  log_warn "Aplicando membresía de grupo docker en la sesión actual..."
  exec sg docker "$0" "$@"
fi
log_ok "Docker daemon accesible"

# ── 2b) NVIDIA Container Toolkit ─────────────────────────────────────────────

if command -v nvidia-ctk &>/dev/null; then
  NCTK_VER="$(nvidia-ctk --version 2>/dev/null | head -1 | awk '{print $NF}')"
  log_ok "NVIDIA Container Toolkit ${NCTK_VER} ya instalado"
else
  log_info "Instalando NVIDIA Container Toolkit..."

  # Repositorio oficial de NVIDIA para Ubuntu 24.04
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | sudo gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y -qq nvidia-container-toolkit

  log_ok "NVIDIA Container Toolkit instalado"
fi

# Configurar runtime NVIDIA en Docker
if ! docker info 2>/dev/null | grep -q 'nvidia'; then
  log_info "Configurando runtime NVIDIA en Docker..."
  sudo nvidia-ctk runtime configure --runtime=docker
  sudo systemctl restart docker
  log_ok "Runtime NVIDIA configurado y Docker reiniciado"
else
  log_ok "Runtime NVIDIA ya configurado en Docker"
fi

# Verificar acceso GPU dentro de Docker
log_info "Verificando acceso GPU en contenedor Docker..."
if docker run --rm --gpus all \
    nvidia/cuda:12.3.0-base-ubuntu22.04 nvidia-smi \
    &>/dev/null 2>&1; then
  log_ok "GPU accesible dentro de Docker"
else
  log_warn "La verificación de GPU en Docker falló. El ai-worker puede no funcionar."
  log_warn "Continuando de todas formas — puedes verificar manualmente después."
fi

# =============================================================================
# SECCIÓN 3 — Construcción de imágenes Docker
# =============================================================================

log_step "SECCIÓN 3: Construcción de imágenes Docker"
log_info "Este proceso puede tardar varios minutos en la primera ejecución..."

docker compose build --no-cache 2>&1 | while IFS= read -r line; do
  echo "  $(date '+%H:%M:%S') | $line"
done

log_ok "Todas las imágenes construidas exitosamente"

# =============================================================================
# SECCIÓN 4 — Arranque de infraestructura base
# =============================================================================

log_step "SECCIÓN 4: Arranque de infraestructura base"

# Función para esperar que un servicio esté healthy
wait_healthy() {
  local service="$1"
  local max_wait="${2:-60}"
  local elapsed=0
  local interval=5

  log_info "Esperando que '${service}' esté healthy (máx ${max_wait}s)..."
  while [[ $elapsed -lt $max_wait ]]; do
    local status
    status="$(docker compose ps --format json 2>/dev/null \
      | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        if obj.get('Service') == '${service}':
            print(obj.get('Health', obj.get('State', '')))
            break
    except Exception:
        pass
" 2>/dev/null || echo "")"

    if [[ "$status" == "healthy" ]]; then
      log_ok "'${service}' está healthy"
      return 0
    fi
    sleep $interval
    elapsed=$((elapsed + interval))
    echo -ne "  → ${elapsed}s / ${max_wait}s...\r"
  done
  echo ""
  error_exit "'${service}' no alcanzó estado healthy en ${max_wait}s. Revisa: docker compose logs ${service}"
}

# Función para esperar que un one-shot service termine con exit 0
wait_exit_ok() {
  local container="$1"
  local max_wait="${2:-60}"
  local elapsed=0

  log_info "Esperando que '${container}' finalice..."
  while [[ $elapsed -lt $max_wait ]]; do
    local state exit_code
    state="$(docker inspect --format='{{.State.Status}}' "${container}" 2>/dev/null || echo '')"
    exit_code="$(docker inspect --format='{{.State.ExitCode}}' "${container}" 2>/dev/null || echo '-1')"

    if [[ "$state" == "exited" ]]; then
      if [[ "$exit_code" == "0" ]]; then
        log_ok "'${container}' completado exitosamente"
        return 0
      else
        error_exit "'${container}' terminó con error (exit ${exit_code}). Revisa: docker logs ${container}"
      fi
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    echo -ne "  → ${elapsed}s / ${max_wait}s...\r"
  done
  echo ""
  error_exit "'${container}' no terminó en ${max_wait}s."
}

# 4.1 Infraestructura base
log_info "Levantando postgres, redis y minio..."
docker compose up -d postgres redis minio

wait_healthy "postgres" 60
wait_healthy "redis"    60
wait_healthy "minio"    60

# 4.2 Inicialización de buckets MinIO (one-shot)
log_info "Inicializando buckets MinIO..."
docker compose up -d minio-init
wait_exit_ok "aerofinder_minio_init" 60

# 4.3 MediaMTX
log_info "Levantando MediaMTX..."
docker compose up -d mediamtx
sleep 5  # MediaMTX puede no tener healthcheck — dar tiempo de arranque
log_ok "MediaMTX iniciado"

# =============================================================================
# SECCIÓN 5 — Inicialización de la base de datos (Alembic)
# =============================================================================

log_step "SECCIÓN 5: Migraciones de base de datos (Alembic)"

# Verificar que postgres sigue healthy
wait_healthy "postgres" 30

log_info "Ejecutando migraciones Alembic..."
if ! docker compose run --rm backend alembic upgrade head; then
  echo -e "\n${RED}  ✗ Las migraciones fallaron. Logs de postgres:${RESET}"
  docker compose logs --tail=30 postgres
  error_exit "alembic upgrade head falló. Revisa los logs anteriores."
fi
log_ok "Migraciones aplicadas correctamente"

# =============================================================================
# SECCIÓN 6 — Arranque completo
# =============================================================================

log_step "SECCIÓN 6: Arranque completo de todos los servicios"

docker compose up -d
log_info "Esperando que todos los servicios estén operativos (máx 120s)..."

# Esperar services con healthcheck
for svc in postgres redis minio backend frontend; do
  wait_healthy "$svc" 120
done

# ai-worker puede tardar más (descarga modelos la primera vez)
log_info "Esperando ai-worker (puede tardar si descarga modelos YOLO/InsightFace)..."
wait_healthy "ai-worker" 180 || log_warn "ai-worker no está healthy aún — puede estar descargando modelos."

echo ""
docker compose ps
echo ""
log_ok "Todos los servicios levantados"

# =============================================================================
# SECCIÓN 7 — Verificaciones post-arranque
# =============================================================================

log_step "SECCIÓN 7: Verificaciones post-arranque"

# Función de verificación HTTP
check_http() {
  local name="$1"
  local url="$2"
  local max_attempts=6
  local attempt=1

  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf --max-time 5 "$url" &>/dev/null; then
      log_ok "${name} responde en ${url}"
      return 0
    fi
    sleep 5
    attempt=$((attempt + 1))
  done
  log_warn "${name} no responde en ${url} (puede seguir iniciando)"
  return 0  # No es fatal — el sistema puede tardar
}

check_http "Backend API"   "http://localhost:8000/health"
check_http "Frontend"      "http://localhost:3000"
check_http "MinIO Console" "http://localhost:9001"

# Verificar GPU en el ai-worker
log_info "Verificando acceso GPU en ai-worker..."
if docker exec aerofinder_ai_worker nvidia-smi 2>/dev/null | head -3; then
  log_ok "GPU accesible dentro del ai-worker"
else
  log_warn "No se pudo verificar GPU en ai-worker (puede seguir iniciando)"
fi

# =============================================================================
# SECCIÓN 8 — Resumen final
# =============================================================================

log_step "SECCIÓN 8: Instalación completada"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║         AEROFINDER — SERVICIOS DISPONIBLES       ║${RESET}"
echo -e "${BOLD}╠═════════════════════╦════════════════════════════╣${RESET}"
echo -e "${BOLD}║${RESET} Frontend            ${BOLD}║${RESET} http://localhost:3000      ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET} Backend API         ${BOLD}║${RESET} http://localhost:8000      ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET} API Docs            ${BOLD}║${RESET} http://localhost:8000/docs ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET} MinIO Console       ${BOLD}║${RESET} http://localhost:9001      ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET} RTMP (drones DJI)   ${BOLD}║${RESET} rtmp://localhost:1935      ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET} HLS (video)         ${BOLD}║${RESET} http://localhost:8888      ${BOLD}║${RESET}"
echo -e "${BOLD}╚═════════════════════╩════════════════════════════╝${RESET}"

echo ""
echo -e "${BOLD}Credenciales del administrador inicial:${RESET}"
echo -e "  Email:    ${GREEN}admin@aerofinder.local${RESET}"
echo -e "  Password: ${GREEN}AeroAdmin2024!${RESET}"

echo ""
echo -e "${BOLD}Comandos útiles de gestión:${RESET}"
echo -e "  ${CYAN}Ver logs en tiempo real:${RESET}"
echo -e "    docker compose logs -f [servicio]"
echo -e "  ${CYAN}Detener todos los servicios:${RESET}"
echo -e "    docker compose down"
echo -e "  ${CYAN}Reiniciar un servicio:${RESET}"
echo -e "    docker compose restart [servicio]"
echo -e "  ${CYAN}Actualizar el sistema:${RESET}"
echo -e "    git pull && docker compose build && docker compose up -d"
echo -e "  ${CYAN}Ver estado de la GPU:${RESET}"
echo -e "    docker exec aerofinder_ai_worker nvidia-smi"
echo -e "  ${CYAN}Eliminar todo (incluye datos):${RESET}"
echo -e "    docker compose down -v"

echo ""
echo -e "${GREEN}${BOLD}  ✓ AEROFINDER instalado y operativo.${RESET}"
echo ""
