# Respaldo y justificación: usar laptop potente como servidor de campo

Resumen
- Mantener la laptop potente como servidor principal en campo ofrece la mayor probabilidad de éxito para detección y reconocimiento en tiempo real. Esta guía explica por qué y cómo respaldarla para eliminar la dependencia de esa única máquina.

Por qué una laptop potente es la mejor opción
- Rendimiento: GPU dedicada (NVIDIA) permite correr YOLOv8 + FaceNet en tiempo real sin pérdidas de frames.
- Flexibilidad: puedes ejecutar todos los servicios (MediaMTX, AI worker, Redis, Postgres, MinIO, frontend) en una sola máquina para operación offline.
- Menos latencia: detección local → alertas inmediatas; no dependes de enlace satelital o móvil.
- Desarrollo y debug: facilita ajustes en sitio y verificación rápida antes de mandar datos a la nube.

Riesgos y mitigaciones
- Riesgo: fallo de la laptop (hardware, batería, daño). Mitigación: tener respaldos automáticos y un dispositivo de respaldo preparado (mini‑PC, Jetson o un SSD con el paquete listo).
- Riesgo: agotamiento de batería. Mitigación: UPS/batería externa o swap de baterías.

Estrategia de respaldo (qué guardar)
- Imágenes Docker usadas por el despliegue (`docker save` output tar).
- Modelos IA descargados (YOLO weights, InsightFace / FaceNet) en la carpeta de modelos.
- Volumen de datos críticos: volcados de la base de datos PostgreSQL (`pg_dump` / `pg_dumpall`).
- Archivos de configuración y `.env` (credenciales, `SERVER_HOST`).
- Scripts y `docker-compose` personalizados (por ejemplo `docker-compose.edge.yml`).

Checklist rápido antes de salir a campo
1. Verificar drivers NVIDIA y CUDA instalados y probados.
2. Ejecutar el script de preparación: `scripts/prepare_field_package.sh` (genera tar con imágenes, modelos, DB opcional).
3. Copiar los tar a un SSD/pendrive o al dispositivo de respaldo.
4. Probar arranque desde frío en el backup (si es posible) o simular restore en VM.

Comandos de restauración básicos
- Cargar imágenes Docker:

```
Docker:

docker load -i aerofinder_images.tar
```

- Restaurar modelos:

```
tar -xzvf aerofinder_models.tar.gz -C /opt/aerofinder/models
```

- Restaurar DB (si el backup incluye `db_dump.sql`):

```
docker exec -i <db_container> psql -U <user> -d <db> < db_dump.sql
```

Verificación después de restaurar
- `docker compose up -d` y revisar `docker compose ps`.
- Revisar logs: `docker compose logs -f backend ai-worker database`.
- En el frontend navegar a la UI local y comprobar que la ingest de video (MediaMTX) funciona.

Programación de backups
- Recomendado: cron diario en la laptop antes de cada misión que ejecute el script de empaquetado y copie los artefactos al SSD externo.

Recomendación de hardware de respaldo
- Un mini‑PC con suficiente almacenamiento (1TB SSD) o un Nvidia Jetson (si sabes adaptar modelos). Tener al menos 1 SSD con el tar de imágenes + modelos listo.

Notas para el proyecto de grado
- Documenta las pruebas de rendimiento (FPS, latencia de reconocimiento) con y sin GPU; adjunta gráficas comparativas.
- Justifica la elección mostrando trade‑offs (coste, portabilidad, consumo) y la estrategia de mitigación (backup + empaquetado).

Contacto y siguientes pasos
- Usa `scripts/prepare_field_package.sh` para crear los artefactos de respaldo.
- Si quieres, genero un `systemd` unit y un ejemplo de cron para automatizar los backups.
