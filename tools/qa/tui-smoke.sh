#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))"
cd "$ROOT"

OUT_DIR="${OUT_DIR:-$ROOT/.run/tui-smoke}"
API_TS_PORT="${THREADLENS_TUI_SMOKE_API_PORT:-8799}"
API_TS_BASE="${THREADLENS_API_URL:-http://127.0.0.1:${API_TS_PORT}}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RAW_LOG="$OUT_DIR/tui-smoke-${TIMESTAMP}.raw.log"
CLEAN_LOG="$OUT_DIR/tui-smoke-${TIMESTAMP}.log"
JSON_REPORT="$OUT_DIR/tui-smoke-${TIMESTAMP}.json"
MD_REPORT="$OUT_DIR/tui-smoke-${TIMESTAMP}.md"

mkdir -p "$OUT_DIR"

API_PID=""
STARTED_API=0

cleanup() {
  if [[ "$STARTED_API" -eq 1 ]] && [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_health() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "health check failed: $url" >&2
  return 1
}

if ! curl -fsS "$API_TS_BASE/api/healthz" >/dev/null 2>&1; then
  echo "[boot] starting api-ts backend for TUI smoke on ${API_TS_PORT}"
  API_TS_PORT="$API_TS_PORT" pnpm --filter @threadlens/api dev >"$OUT_DIR/api-ts-${TIMESTAMP}.log" 2>&1 &
  API_PID="$!"
  STARTED_API=1
fi
wait_for_health "$API_TS_BASE/api/healthz"

if ! command -v script >/dev/null 2>&1; then
  echo "script command is required for pseudo-tty TUI smoke" >&2
  exit 1
fi

CMD="THREADLENS_API_URL='$API_TS_BASE' pnpm --filter @threadlens/tui exec tsx src/cli.tsx --view sessions --provider all --locale en"

set +e
script -q "$RAW_LOG" bash -lc "$CMD" >/dev/null 2>&1 &
SCRIPT_PID="$!"
sleep "${THREADLENS_TUI_SMOKE_SECONDS:-8}"
kill "$SCRIPT_PID" >/dev/null 2>&1 || true
wait "$SCRIPT_PID" >/dev/null 2>&1
set -e

perl -pe 's/\e\[[0-9;?]*[ -\/]*[@-~]//g; s/\r/\n/g' "$RAW_LOG" >"$CLEAN_LOG"

result="PASS"
reason=""
if ! grep -Eiq "ThreadLens|Sessions|Search|Cleanup|provider|session" "$CLEAN_LOG"; then
  result="FAIL"
  reason="expected-tui-text-not-found"
elif grep -Eiq "fetch failed|ECONNREFUSED|Unhandled|Error:" "$CLEAN_LOG"; then
  result="FAIL"
  reason="tui-error-output"
fi

python3 - \
  "$JSON_REPORT" \
  "$MD_REPORT" \
  "$TIMESTAMP" \
  "$result" \
  "$reason" \
  "$API_TS_BASE" \
  "$RAW_LOG" \
  "$CLEAN_LOG" \
<<'PY'
import json
import pathlib
import sys

json_path, md_path, timestamp, result, reason, api_base, raw_log, clean_log = sys.argv[1:]
payload = {
    "timestamp_utc": timestamp,
    "result": result,
    "reason": reason,
    "api_base": api_base,
    "raw_log": raw_log,
    "clean_log": clean_log,
}
pathlib.Path(json_path).write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n")
pathlib.Path(md_path).write_text(
    "\n".join(
        [
            f"# TUI Smoke ({timestamp})",
            "",
            f"- Result: `{result}`",
            f"- API: `{api_base}`",
            f"- Raw log: `{raw_log}`",
            f"- Clean log: `{clean_log}`",
            *( [f"- Reason: `{reason}`"] if reason else [] ),
            "",
        ]
    ),
    encoding="utf-8",
)
PY

echo "JSON: $JSON_REPORT"
echo "MD:   $MD_REPORT"
echo "LOG:  $CLEAN_LOG"

if [[ "$result" != "PASS" ]]; then
  cat "$CLEAN_LOG" >&2
  exit 1
fi

echo "tui smoke PASS"
