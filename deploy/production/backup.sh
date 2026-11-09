#!/usr/bin/env bash
# Writes a verified pg_dump before a release. Backups are never pruned here.
set -euo pipefail
umask 077

tag=$1
dir=$HOME/twhp-backups
file=$dir/$(date +%Y%m%d-%H%M%S)-$tag.dump
mkdir -p "$dir"

size=$(docker exec twhp-postgres sh -c 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -Atc "select pg_database_size(current_database())"')
available=$(df -Pk "$dir" | awk 'NR==2 {print $4 * 1024}')
# A dump that fills the disk would take the live database down with it.
if [ "$available" -lt $((size * 2)) ]; then
  echo "backup FAIL  $available bytes free, need $((size * 2))" >&2
  exit 1
fi

docker exec twhp-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -Fc' > "$file.partial"

tables=$(docker exec -i twhp-postgres pg_restore --list < "$file.partial" | grep -c 'TABLE DATA' || true)
if [ "$tables" -lt 1 ]; then
  echo "backup FAIL  $file.partial has no table data" >&2
  exit 1
fi

mv "$file.partial" "$file"
echo "ok    backup: $file, $(du -h "$file" | cut -f1), $tables tables"
