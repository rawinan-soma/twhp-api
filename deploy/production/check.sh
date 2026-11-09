#!/usr/bin/env bash
# Runs every check, then fails if any failed.
tag=$1
fail=0

report() {
  if [ "$1" = "$2" ]; then
    echo "ok    $3"
  else
    echo "FAIL  $3: got '$1'"
    fail=1
  fi
}

inspect() {
  docker inspect -f "$2" "$1" 2>/dev/null
}

report "$(inspect twhp-api-prod '{{.State.Health.Status}}')" healthy "api healthy"
report "$(inspect twhp-workers '{{.State.Running}}')" true "worker running"
report "$(inspect twhp-postgres '{{.State.Running}}')" true "postgres running"

if [ "$tag" != previous ]; then
  label='{{index .Config.Labels "org.opencontainers.image.revision"}}'
  report "$(inspect twhp-api-prod "$label")" "$tag" "api runs $tag"
  report "$(inspect twhp-workers "$label")" "$tag" "worker runs $tag"
fi

body=$(docker exec twhp-nginx sh -c 'wget -qO- --header "X-API-Key: $NGINX_API_KEY" http://127.0.0.1/twhp/api/health' 2>/dev/null)
report "$body" 'Ready to work!!' "health through nginx"

echo "released: $(tail -1 "$HOME/twhp-api/releases.log")"
exit $fail
