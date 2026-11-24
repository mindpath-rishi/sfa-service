#!/usr/bin/env bash
# Prepares OpenStreetMap road data for the OSRM road-matching server.
# Run once, then monthly to pick up new roads:
#   ./setup.sh africa/zambia          (any Geofabrik region path)
# Then: docker compose -f docker-compose.osrm.yml up -d
set -euo pipefail

REGION="${1:-${OSRM_REGION:-africa/zambia}}"
NAME="$(basename "$REGION")"
DATA_DIR="$(cd "$(dirname "$0")" && pwd)/data"
IMAGE="ghcr.io/project-osrm/osrm-backend:v5.27.1"

mkdir -p "$DATA_DIR"
echo "Downloading ${REGION} roads from Geofabrik…"
curl -fL -o "$DATA_DIR/region.osm.pbf.tmp" "https://download.geofabrik.de/${REGION}-latest.osm.pbf"
mv "$DATA_DIR/region.osm.pbf.tmp" "$DATA_DIR/region.osm.pbf"

echo "Building the car routing graph (a few minutes for one country)…"
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" osrm-extract -p /opt/car.lua /data/region.osm.pbf
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" osrm-partition /data/region.osrm
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" osrm-customize /data/region.osrm

echo "Done (${NAME}). Restart OSRM: docker compose restart osrm"
