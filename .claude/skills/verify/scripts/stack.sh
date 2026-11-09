#!/usr/bin/env bash
# Drives the disposable twhp-verify stack defined in docker-compose.verify.yaml.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
COMPOSE=(docker compose -p twhp-verify -f "$ROOT/docker-compose.verify.yaml")
API="http://127.0.0.1:3901/twhp/api"
MAIL="http://127.0.0.1:8925/api/v1"
EVIDENCE="$ROOT/.verify-evidence"
JAR="$EVIDENCE/cookies.txt"

mkdir -p "$EVIDENCE"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

wait_mail() {
  local to="$1" before="$2" secs="${3:-30}"
  for _ in $(seq 1 "$secs"); do
    local n
    n=$(curl -sf "$MAIL/search?query=to:$to" | json 'd["messages_count"]')
    [ "$n" -gt "$before" ] && return 0
    sleep 1
  done
  echo "no new email to $to within ${secs}s" >&2
  return 1
}

mail_count() { curl -sf "$MAIL/search?query=to:$1" | json 'd["messages_count"]'; }

case "${1:-}" in
  up)
    "${COMPOSE[@]}" up -d --build --wait
    ;;
  doctor)
    "${COMPOSE[@]}" ps -a --format '{{.Service}}	{{.State}}	exit={{.ExitCode}}'
    "${COMPOSE[@]}" ps -a --format '{{.Service}} {{.ExitCode}}' | grep -q '^migrate 0$' \
      || { echo "migrate did not exit 0: run '$0 logs migrate'" >&2; exit 1; }
    curl -sf -o /dev/null "$API/health" && echo "api: healthy on 127.0.0.1:3901"
    curl -sf "$MAIL/info" | json '"mailpit: " + d["Version"] + ", " + str(d["Messages"]) + " message(s)"'
    "${COMPOSE[@]}" exec -T api printenv SMTP_HOST | grep -qx mailpit \
      && echo "smtp: api -> mailpit"
    "${COMPOSE[@]}" exec -T worker printenv SMTP_HOST | grep -qx mailpit \
      && echo "smtp: worker -> mailpit"
    ;;
  login)
    user="$2" pass="$3"
    email=$("${COMPOSE[@]}" exec -T postgres psql -U admin -d twhp -tAc \
      "SELECT email FROM \"Accounts\" WHERE username = '$user'")
    before=$(mail_count "$email")
    resp=$(curl -sf -c "$JAR" -X POST "$API/authentication/login" \
      -H 'content-type: application/json' -d "{\"username\":\"$user\",\"password\":\"$pass\"}")
    echo "$resp" > "$EVIDENCE/login-$user.json"
    if [ "$(echo "$resp" | json 'd.get("twoFactorRequired", False)')" = "True" ]; then
      challenge=$(echo "$resp" | json 'd["challengeId"]')
      wait_mail "$email" "$before" 10 \
        || echo "no new OTP email: the app reused a live challenge, using the newest OTP email" >&2
      id=$(curl -sf "$MAIL/search?query=to:$email%20subject:OTP" | json 'd["messages"][0]["ID"]')
      code=$(curl -sf "$MAIL/message/$id" | python3 -c \
        'import sys,json,re; print(re.search(r"(\d{6})", json.load(sys.stdin)["Text"]).group(1))')
      curl -sf -b "$JAR" -c "$JAR" -X POST "$API/authentication/login/verify-otp" \
        -H 'content-type: application/json' -d "{\"challengeId\":\"$challenge\",\"code\":\"$code\"}" \
        > "$EVIDENCE/verify-otp-$user.json"
    fi
    curl -sf -b "$JAR" "$API/authentication" | tee "$EVIDENCE/whoami-$user.json"
    echo
    ;;
  call)
    method="$2" path="$3" body="${4:-}"
    if [ -n "$body" ]; then
      curl -s -b "$JAR" -c "$JAR" -X "$method" "$API$path" -H 'content-type: application/json' \
        -d "$body" -w '\nHTTP %{http_code}\n'
    else
      curl -s -b "$JAR" -c "$JAR" -X "$method" "$API$path" -w '\nHTTP %{http_code}\n'
    fi
    ;;
  mail)
    curl -sf "$MAIL/messages" | python3 -c '
import sys, json
for m in json.load(sys.stdin)["messages"]:
    to = ", ".join(a["Address"] for a in m["To"])
    cc = ", ".join(a["Address"] for a in (m.get("Cc") or []))
    print(m["ID"], "|", to, "| cc:", cc or "-", "|", m["Subject"])'
    ;;
  mail-save)
    curl -sf "$MAIL/message/$2" > "$EVIDENCE/mail-$2.json" && echo "$EVIDENCE/mail-$2.json"
    ;;
  sql)
    "${COMPOSE[@]}" exec -T postgres psql -U admin -d twhp -c "$2"
    ;;
  logs)
    "${COMPOSE[@]}" logs --no-color "${2:-}"
    ;;
  down)
    "${COMPOSE[@]}" down -v --remove-orphans
    ;;
  *)
    echo "usage: $0 up|doctor|login <user> <pass>|call <METHOD> <path> [json]|mail|mail-save <id>|sql <query>|logs [service]|down" >&2
    exit 2
    ;;
esac
