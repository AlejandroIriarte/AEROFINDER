#!/usr/bin/env bash
# =============================================================================
# AEROFINDER AI Worker — Entrypoint
# Descarga modelos si no están presentes, luego inicia el worker
# Los modelos se persisten en el volumen /models entre reinicios
# =============================================================================
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-/models}"
YOLO_MODEL="${YOLO_MODEL_PATH:-${MODELS_DIR}/yolov8n.pt}"
INSIGHTFACE_DIR="${INSIGHTFACE_MODEL_DIR:-${MODELS_DIR}/insightface}"
BUFFALO_L_MARKER="${INSIGHTFACE_DIR}/models/buffalo_l/.downloaded"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AEROFINDER: verificando modelos de IA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── YOLOv8n ──────────────────────────────────────────────────────────────────
if [ ! -f "$YOLO_MODEL" ]; then
    echo "  → YOLOv8n no encontrado. Descargando (~6MB)..."
    python - << PYEOF
from ultralytics import YOLO
import shutil, os

model = YOLO('yolov8n.pt')  # descarga automáticamente desde Ultralytics
src = 'yolov8n.pt'
dst = '${YOLO_MODEL}'
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.move(src, dst)
print(f"  YOLOv8n guardado en {dst}")
PYEOF
else
    echo "  ✓ YOLOv8n presente: $YOLO_MODEL"
fi

# ── InsightFace buffalo_l ─────────────────────────────────────────────────────
if [ ! -f "$BUFFALO_L_MARKER" ]; then
    echo "  → InsightFace buffalo_l no encontrado. Descargando (~500MB)..."
    python - << PYEOF
import insightface
from insightface.app import FaceAnalysis
import os

root = '${INSIGHTFACE_DIR}'
os.makedirs(root, exist_ok=True)

# FaceAnalysis descarga buffalo_l automáticamente al preparar
app = FaceAnalysis(name='buffalo_l', root=root)
app.prepare(ctx_id=0)  # ctx_id=0 usa GPU 0

# Marcar como descargado para no volver a intentarlo
marker = '${BUFFALO_L_MARKER}'
with open(marker, 'w') as f:
    f.write('ok')

print(f"  InsightFace buffalo_l listo en {root}")
PYEOF
else
    echo "  ✓ InsightFace buffalo_l presente: $INSIGHTFACE_DIR"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Modelos listos. Iniciando worker..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exec "$@"
