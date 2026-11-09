#!/usr/bin/env bash
# Model-checks .claude/skills/review-flow/model/ReviewFlow.tla with TLC.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SKILL="$ROOT/.claude/skills/review-flow"
MODEL="$SKILL/model"
JAR="$ROOT/tools/tla2tools.jar"
TLC_VERSION="v1.7.4"
TLC_SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
SYNC_COMMIT="e0bed76"
COVERED=(src/service/evaluator-review.ts src/service/answer.ts src/utils.ts)

fetch_tlc() {
  if [ ! -f "$JAR" ]; then
    mkdir -p "$(dirname "$JAR")"
    curl -fsSL -o "$JAR" "https://github.com/tlaplus/tlaplus/releases/download/$TLC_VERSION/tla2tools.jar"
  fi
  echo "$TLC_SHA256  $JAR" | shasum -a 256 -c --status \
    || { echo "tla2tools.jar checksum mismatch; delete $JAR and rerun" >&2; exit 1; }
}

# tlc <dir> <cfg>: prints TLC's verdict lines and the trace; exit 0 only when no error was found.
tlc() {
  local out
  out=$(cd "$1" && java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto \
    -metadir "$(mktemp -d)" -config "$2" ReviewFlow.tla 2>&1) || true
  echo "$out" | sed -n '/is violated/,/distinct states found/p'
  echo "$out" | grep -E "No error has been found|distinct states found" | tail -1
  echo "$out" | grep -q "No error has been found"
}

case "${1:-check}" in
  check)
    fetch_tlc
    tlc "$MODEL" ReviewFlow.cfg && echo "PASS: every rule in ReviewFlow.cfg holds"
    ;;
  findings)
    fetch_tlc
    for cfg in "$MODEL"/Finding_*.cfg; do
      name=$(basename "$cfg" .cfg)
      echo "=== $name (expected to fail until the finding is fixed)"
      if tlc "$MODEL" "$(basename "$cfg")"; then
        echo "NOW PASSES: the code may have fixed $name; confirm in the code, then update SKILL.md"
      fi
    done
    ;;
  mutants)
    fetch_tlc
    fail=0
    while IFS='|' read -r name from to; do
      [ -z "$name" ] && continue
      tmp=$(mktemp -d)
      cp "$MODEL/ReviewFlow.tla" "$MODEL/ReviewFlow.cfg" "$tmp/"
      FROM="$from" TO="$to" perl -0pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/ or die "mutant anchor not found\n"' "$tmp/ReviewFlow.tla" \
        || { echo "STALE MUTANT $name: its anchor text is gone from the model"; fail=1; continue; }
      if tlc "$tmp" ReviewFlow.cfg >/dev/null; then
        echo "MUTANT SURVIVED $name: the checked rules did not catch it"; fail=1
      else
        echo "caught $name"
      fi
      rm -rf "$tmp"
    done < "$SKILL/scripts/mutants.txt"
    exit "$fail"
    ;;
  drift)
    echo "Covered code changed since sync commit $SYNC_COMMIT:"
    git -C "$ROOT" diff --stat "$SYNC_COMMIT" -- "${COVERED[@]}"
    git -C "$ROOT" diff --quiet "$SYNC_COMMIT" -- "${COVERED[@]}" && echo "(none)"
    ;;
  *)
    echo "usage: $0 check|findings|mutants|drift" >&2
    exit 2
    ;;
esac
