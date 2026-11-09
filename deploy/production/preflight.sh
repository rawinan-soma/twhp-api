#!/usr/bin/env bash
# Refuses a host that is not the expected production stack. Changes nothing.
set -euo pipefail

project=$1
image=$2
dir=$HOME/twhp-api

fail() {
  echo "preflight FAIL  $*" >&2
  exit 1
}

running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]
}

[ "$(uname -m)" = x86_64 ] || fail "the image is built for linux/amd64, this host is $(uname -m)"
[ -f "$dir/docker.env" ] || fail "no $dir/docker.env"
[ -f "$dir/docker-compose.yaml" ] || fail "no $dir/docker-compose.yaml"
running twhp-api-prod || fail "twhp-api-prod is not running, so this is not a live production host"
running twhp-postgres || fail "twhp-postgres is not running"
running twhp-nginx || fail "twhp-nginx is not running"

label() {
  docker inspect -f "{{index .Config.Labels \"com.docker.compose.project$1\"}}" twhp-postgres
}
[ "$(label '')" = "$project" ] || fail "twhp-postgres belongs to Compose project '$(label '')', expected '$project'"
[ "$(label .working_dir)" = "$dir" ] || fail "twhp-postgres was started from '$(label .working_dir)', expected '$dir'"

volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' twhp-postgres)
[ "$volume" = "${project}_postgres_data" ] || fail "database volume is '$volume', expected '${project}_postgres_data'"

docker network inspect "${project}_default" >/dev/null 2>&1 || fail "no network ${project}_default"

compose=(docker compose --project-name "$project" --profile production -f "$dir/docker-compose.yaml")
"${compose[@]}" config --quiet || fail "docker-compose.yaml does not parse"
"${compose[@]}" config --images | grep -qx "$image:latest" || fail "production services do not use $image:latest"

echo "ok    preflight: $(hostname), database volume $volume"
