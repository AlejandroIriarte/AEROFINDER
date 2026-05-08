# =============================================================================
# AEROFINDER — Imagen del Worker de IA (YOLO + InsightFace + GPU)
# Base: CUDA 12.6 + cuDNN + Ubuntu 24.04
#
# Requiere: driver NVIDIA >= 525 en el host y nvidia-container-toolkit
# Los modelos (YOLOv8n, buffalo_l) se descargan en el primer arranque
# y se persisten en el volumen /models (montado desde el host)
# =============================================================================

FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04

# Ubuntu 24.04 incluye Python 3.12 por defecto
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-dev \
    python3-pip \
    python3-venv \
    # OpenCV requiere estas librerías de sistema
    # libgl1-mesa-glx fue reemplazado por libgl1 en Ubuntu 24.04 Noble
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    # Compilador C++ necesario para insightface (compila extensiones nativas)
    build-essential \
    # Herramientas de red y diagnóstico
    curl \
    # Necesario para descargar modelos ONNX de InsightFace
    wget \
 && rm -rf /var/lib/apt/lists/*

# Crear usuario sin privilegios (UID 1001 para evitar colisión con ubuntu en imagen CUDA)
RUN useradd -m -u 1001 -s /bin/bash worker

WORKDIR /app

# Virtualenv aislado para el worker
RUN python3.12 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Instalar dependencias Python
# onnxruntime-gpu usa CUDA via cuDNN incluido en la imagen base
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Código del worker (creado en AI-1)
COPY --chown=worker:worker . .

# Directorio de modelos — se monta como volumen Docker
# para persistir entre reinicios sin redownload
RUN mkdir -p /models && chown 1001:1001 /models
VOLUME ["/models"]

USER worker

# El entrypoint descarga los modelos si faltan y luego inicia el worker
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "main.py"]
