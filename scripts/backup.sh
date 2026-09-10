#!/usr/bin/env bash
# Backup de los datos persistentes de ValoIA (usuarios, perfiles, RSO,
# favoritas, historial, comentarios) + archivo acumulativo de partidas.
# Uso: bash scripts/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

STAMP="$(date +%F)"
OUT_DIR="backups"
mkdir -p "$OUT_DIR"

DATA_VOL="$(docker volume ls --format '{{.Name}}' | grep -E '_valo-data$' | head -1 || true)"
ARCH_VOL="$(docker volume ls --format '{{.Name}}' | grep -E '_valo-archive$' | head -1 || true)"

if [ -z "$DATA_VOL" ]; then
  echo "ERROR: no encuentro el volumen *_valo-data (¿levantaste docker-compose.prod.yml?)" >&2
  exit 1
fi
if [ -z "$ARCH_VOL" ]; then
  echo "AVISO: no encuentro *_valo-archive; se respalda solo data" >&2
fi

TARGETS="data"
MOUNTS=(-v "$DATA_VOL":/data:ro)
if [ -n "$ARCH_VOL" ]; then
  TARGETS="data archive"
  MOUNTS+=(-v "$ARCH_VOL":/archive:ro)
fi

docker run --rm \
  "${MOUNTS[@]}" \
  -v "$(pwd)/$OUT_DIR":/backup \
  alpine sh -c "tar czf /backup/valoia-$STAMP.tar.gz -C / $TARGETS"

# Conserva los últimos 14 backups.
ls -1t "$OUT_DIR"/valoia-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "Backup creado: $OUT_DIR/valoia-$STAMP.tar.gz"
