#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/prepare_field_package.sh [output_dir]
# Environment variables (optional): MODEL_DIR, DB_CONTAINER, COMPOSE_FILE

OUTPUT_DIR=${1:-./aerofinder_field_package}
MODEL_DIR=${MODEL_DIR:-./models}
DB_CONTAINER=${DB_CONTAINER:-database}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}

mkdir -p "$OUTPUT_DIR"

echo "Pulling images (best-effort)..."
docker compose -f "$COMPOSE_FILE" pull || true

echo "Saving images to $OUTPUT_DIR/aerofinder_images.tar (best-effort)..."
# Try to save images referenced by compose. If it fails, it won't abort the whole script.
set +e
IMAGES=$(docker compose -f "$COMPOSE_FILE" images -q 2>/dev/null | tr '\n' ' ')
if [ -n "$IMAGES" ]; then
  echo "$IMAGES" | xargs docker save -o "$OUTPUT_DIR/aerofinder_images.tar"
  if [ $? -ne 0 ]; then
    echo "docker save failed; images may not be saved."
  fi
else
  echo "No image IDs found via 'docker compose images -q'; attempting fallback (may not save)."
  SERVICES=$(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null || true)
  if [ -n "$SERVICES" ]; then
    # Try to extract images from compose config and save them
    IMGLIST=""
    for s in $SERVICES; do
      img=$(docker compose -f "$COMPOSE_FILE" config | sed -n "s/.*image: \(.*\)/\1/p" | head -n1)
      IMGLIST="$IMGLIST $img"
    done
    echo "$IMGLIST" | xargs -r docker save -o "$OUTPUT_DIR/aerofinder_images.tar" || echo "fallback docker save failed"
  fi
fi
set -e

if [ -d "$MODEL_DIR" ]; then
  echo "Packing models from $MODEL_DIR..."
  tar -czf "$OUTPUT_DIR/aerofinder_models.tar.gz" -C "$MODEL_DIR" .
else
  echo "Model dir $MODEL_DIR not found, skipping models packaging."
fi

# DB dump if container exists
if docker ps --format '{{.Names}}' | grep -q "$DB_CONTAINER"; then
  echo "Dumping DB from container $DB_CONTAINER..."
  docker exec -i "$DB_CONTAINER" pg_dumpall -U postgres > "$OUTPUT_DIR/db_dump.sql" || echo "pg_dumpall failed"
else
  echo "DB container $DB_CONTAINER not found, skipping DB dump."
fi

# Copy compose and env
if [ -f "$COMPOSE_FILE" ]; then
  cp -v "$COMPOSE_FILE" "$OUTPUT_DIR/" || true
fi
if [ -f .env ]; then
  cp -v .env "$OUTPUT_DIR/.env" || true
fi

chmod -R a+r "$OUTPUT_DIR" || true

echo "Field package written to $OUTPUT_DIR"
