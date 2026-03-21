#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${OUT_DIR:-$ROOT/.run/e2e-live}"
API_TS_PORT="${WEB_LIVE_API_TS_PORT:-8799}"
API_TS_BASE="http://127.0.0.1:${API_TS_PORT}"
WEB_PORT="${PLAYWRIGHT_LIVE_PORT:-5183}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$OUT_DIR/web-live-e2e-${TIMESTAMP}.log"
JSON_REPORT="$OUT_DIR/web-live-e2e-${TIMESTAMP}.json"
MD_REPORT="$OUT_DIR/web-live-e2e-${TIMESTAMP}.md"
PW_OUTPUT_DIR="$OUT_DIR/test-results-${TIMESTAMP}"

mkdir -p "$OUT_DIR"

TS_PID=""
STARTED_TS=0

cleanup() {
  if [[ "$STARTED_TS" -eq 1 ]] && [[ -n "$TS_PID" ]] && kill -0 "$TS_PID" >/dev/null 2>&1; then
    kill "$TS_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_health() {
  local url="$1"
  local name="$2"
  local tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "health check failed: $name ($url)" >&2
  return 1
}

if ! curl -fsS "$API_TS_BASE/api/healthz" >/dev/null 2>&1; then
  echo "[boot] starting api-ts backend on ${API_TS_PORT}"
  API_TS_PORT="$API_TS_PORT" pnpm --filter @provider-surface/api dev >"$ROOT/.web-live-e2e-api-ts.log" 2>&1 &
  TS_PID="$!"
  STARTED_TS=1
fi
wait_for_health "$API_TS_BASE/api/healthz" "api-ts"

echo "[prep] ensure playwright chromium"
pnpm --filter @provider-surface/web exec playwright install chromium >/dev/null

echo "[run] web live e2e smoke"
started_at="$(date +%s)"
set +e
PLAYWRIGHT_LIVE_API_PROXY_TARGET="$API_TS_BASE" \
PLAYWRIGHT_LIVE_PORT="$WEB_PORT" \
pnpm --filter @provider-surface/web exec playwright test -c playwright.live.config.ts --output "$PW_OUTPUT_DIR" 2>&1 | tee "$LOG_FILE"
run_status="${PIPESTATUS[0]}"
set -e
ended_at="$(date +%s)"
duration_sec="$((ended_at - started_at))"

result="PASS"
reason=""
if [[ "$run_status" -ne 0 ]]; then
  result="FAIL"
  reason="playwright-live-e2e-failed"
fi

python3 - \
  "$JSON_REPORT" \
  "$MD_REPORT" \
  "$TIMESTAMP" \
  "$result" \
  "$reason" \
  "$duration_sec" \
  "$LOG_FILE" \
  "$PW_OUTPUT_DIR" \
<<'PY'
import json
import pathlib
import sys

(
    json_path,
    md_path,
    timestamp,
    result,
    reason,
    duration_sec,
    log_file,
    output_dir,
) = sys.argv[1:]

payload = {
    "timestamp_utc": timestamp,
    "result": result,
    "reason": reason,
    "duration_sec": int(duration_sec),
    "log_file": log_file,
    "playwright_output_dir": output_dir,
}
pathlib.Path(json_path).write_text(
    json.dumps(payload, ensure_ascii=True, indent=2) + "\n",
    encoding="utf-8",
)

lines = [
    f"# Web Live E2E Smoke ({timestamp})",
    "",
    f"- Result: `{result}`",
    f"- Duration: `{duration_sec}s`",
]
if reason:
    lines.append(f"- Reason: `{reason}`")
lines.extend(
    [
        "",
        "## Artifacts",
        f"- Log: `{log_file}`",
        f"- Playwright output: `{output_dir}`",
    ],
)
pathlib.Path(md_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

echo "JSON: $JSON_REPORT"
echo "MD:   $MD_REPORT"
echo "LOG:  $LOG_FILE"
echo "PW:   $PW_OUTPUT_DIR"

if [[ "$run_status" -ne 0 ]]; then
  exit "$run_status"
fi

echo "web live e2e smoke PASS"
