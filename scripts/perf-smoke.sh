#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS_BASE="${TS_BASE:-http://127.0.0.1:8788}"
OUT_DIR="${OUT_DIR:-$ROOT/.run/perf}"
THREADS_QUERY="${THREADS_QUERY:-offset=0&q=&sort=updated_desc}"
PERF_SMOKE_STRICT="${PERF_SMOKE_STRICT:-0}"
MIN_THREADS_RATIO="${MIN_THREADS_RATIO:-1.6}"
MIN_THREADS_REDUCTION_PCT="${MIN_THREADS_REDUCTION_PCT:-40}"
MAX_AGENT_RUNTIME_SEC="${MAX_AGENT_RUNTIME_SEC:-1.5}"
MAX_PROVIDER_MATRIX_SEC="${MAX_PROVIDER_MATRIX_SEC:-2.0}"
MAX_PROVIDER_SESSIONS_SEC="${MAX_PROVIDER_SESSIONS_SEC:-2.5}"

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing dependency: curl" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "Missing dependency: jq" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Missing dependency: python3" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

if ! curl -fsS "$TS_BASE/api/healthz" >/dev/null 2>&1; then
  echo "TS API is not reachable at $TS_BASE" >&2
  echo "Start the stack first (api-ts 8788, plus web/electron if needed)." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
metrics_file="$tmpdir/metrics.jsonl"

measure_get() {
  local key="$1"
  local url="$2"
  local body_file="$tmpdir/${key}.json"
  local stats status time_total size_download rows

  stats="$(curl -sS -o "$body_file" -w "status=%{http_code} time_total=%{time_total} size_download=%{size_download}" "$url")"
  status="$(printf '%s\n' "$stats" | sed -E 's/.*status=([0-9]+).*/\1/')"
  time_total="$(printf '%s\n' "$stats" | sed -E 's/.*time_total=([0-9.]+).*/\1/')"
  size_download="$(printf '%s\n' "$stats" | sed -E 's/.*size_download=([0-9]+).*/\1/')"

  if [[ "$status" != "200" ]]; then
    echo "Request failed: $key ($url) -> status $status" >&2
    return 1
  fi

  rows=""
  if jq -e '.rows' "$body_file" >/dev/null 2>&1; then
    rows="$(jq '.rows | length' "$body_file")"
  fi

  python3 - "$key" "$url" "$status" "$time_total" "$size_download" "$rows" "$metrics_file" <<'PY'
import json
import pathlib
import sys

key, url, status, time_total, size_download, rows, metrics_file = sys.argv[1:]
payload = {
    "key": key,
    "url": url,
    "status": int(status),
    "time_total": float(time_total),
    "size_download": int(size_download),
}
if rows:
    payload["rows"] = int(rows)
pathlib.Path(metrics_file).write_text(
    pathlib.Path(metrics_file).read_text(encoding="utf-8") + json.dumps(payload, ensure_ascii=True) + "\n"
    if pathlib.Path(metrics_file).exists()
    else json.dumps(payload, ensure_ascii=True) + "\n",
    encoding="utf-8",
)
PY
}

measure_get "agent_runtime" "$TS_BASE/api/agent-runtime"
measure_get "threads_60" "$TS_BASE/api/threads?${THREADS_QUERY}&limit=60"
measure_get "threads_160" "$TS_BASE/api/threads?${THREADS_QUERY}&limit=160"
measure_get "provider_matrix" "$TS_BASE/api/provider-matrix"
measure_get "provider_sessions_30" "$TS_BASE/api/provider-sessions?limit=30"

json_report="$OUT_DIR/perf-smoke-${timestamp}.json"
md_report="$OUT_DIR/perf-smoke-${timestamp}.md"

python3 - \
  "$metrics_file" \
  "$json_report" \
  "$md_report" \
  "$timestamp" \
  "$TS_BASE" \
  "$PERF_SMOKE_STRICT" \
  "$MIN_THREADS_RATIO" \
  "$MIN_THREADS_REDUCTION_PCT" \
  "$MAX_AGENT_RUNTIME_SEC" \
  "$MAX_PROVIDER_MATRIX_SEC" \
  "$MAX_PROVIDER_SESSIONS_SEC" \
<<'PY'
import json
import pathlib
import sys

metrics_path = pathlib.Path(sys.argv[1])
json_report = pathlib.Path(sys.argv[2])
md_report = pathlib.Path(sys.argv[3])
timestamp = sys.argv[4]
base = sys.argv[5]
strict = sys.argv[6] == "1"
min_threads_ratio = float(sys.argv[7])
min_threads_reduction_pct = float(sys.argv[8])
max_agent_runtime_sec = float(sys.argv[9])
max_provider_matrix_sec = float(sys.argv[10])
max_provider_sessions_sec = float(sys.argv[11])

rows = [json.loads(line) for line in metrics_path.read_text(encoding="utf-8").splitlines() if line.strip()]
by_key = {item["key"]: item for item in rows}

threads_60 = by_key.get("threads_60")
threads_160 = by_key.get("threads_160")
ratio = None
reduction = None
if threads_60 and threads_160 and threads_60["size_download"] > 0 and threads_160["size_download"] > 0:
    ratio = threads_160["size_download"] / threads_60["size_download"]
    reduction = (1 - (threads_60["size_download"] / threads_160["size_download"])) * 100

summary = {
    "timestamp_utc": timestamp,
    "base_url": base,
    "metrics": rows,
    "threads_payload_ratio_160_over_60": ratio,
    "threads_payload_reduction_percent_when_60": reduction,
    "strict_mode": strict,
    "thresholds": {
        "min_threads_ratio": min_threads_ratio,
        "min_threads_reduction_pct": min_threads_reduction_pct,
        "max_agent_runtime_sec": max_agent_runtime_sec,
        "max_provider_matrix_sec": max_provider_matrix_sec,
        "max_provider_sessions_sec": max_provider_sessions_sec,
    },
}

checks = []
failed = []

def add_check(name, ok, detail):
    item = {"name": name, "ok": bool(ok), "detail": detail}
    checks.append(item)
    if not ok:
        failed.append(item)

if ratio is None:
    add_check("threads_payload_ratio", False, "unable to compute")
else:
    add_check(
        "threads_payload_ratio",
        ratio >= min_threads_ratio,
        f"ratio={ratio:.2f} (threshold>={min_threads_ratio:.2f})",
    )

if reduction is None:
    add_check("threads_payload_reduction", False, "unable to compute")
else:
    add_check(
        "threads_payload_reduction",
        reduction >= min_threads_reduction_pct,
        f"reduction={reduction:.1f}% (threshold>={min_threads_reduction_pct:.1f}%)",
    )

agent_runtime = by_key.get("agent_runtime")
if agent_runtime:
    add_check(
        "agent_runtime_latency",
        agent_runtime["time_total"] <= max_agent_runtime_sec,
        f"time_total={agent_runtime['time_total']:.3f}s (threshold<={max_agent_runtime_sec:.3f}s)",
    )

provider_matrix = by_key.get("provider_matrix")
if provider_matrix:
    add_check(
        "provider_matrix_latency",
        provider_matrix["time_total"] <= max_provider_matrix_sec,
        f"time_total={provider_matrix['time_total']:.3f}s (threshold<={max_provider_matrix_sec:.3f}s)",
    )

provider_sessions = by_key.get("provider_sessions_30")
if provider_sessions:
    add_check(
        "provider_sessions_30_latency",
        provider_sessions["time_total"] <= max_provider_sessions_sec,
        f"time_total={provider_sessions['time_total']:.3f}s (threshold<={max_provider_sessions_sec:.3f}s)",
    )

summary["checks"] = checks
summary["ok"] = len(failed) == 0
json_report.write_text(json.dumps(summary, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

def line_for(item):
    rows_txt = f", rows={item.get('rows')}" if "rows" in item else ""
    return f"- {item['key']}: status={item['status']}, time_total={item['time_total']:.6f}s, size_download={item['size_download']}{rows_txt}"

lines = [
    f"# Perf Smoke ({timestamp})",
    "",
    f"- Base URL: `{base}`",
    "",
    "## Measurements",
]
for item in rows:
    lines.append(line_for(item))

lines.extend(["", "## Threads Payload Delta"])
if ratio is None or reduction is None:
    lines.append("- Unable to compute payload delta")
else:
    lines.append(f"- size ratio (160/60): `{ratio:.2f}x`")
    lines.append(f"- size reduction with limit=60: `{reduction:.1f}%`")

lines.extend(["", "## Guardrail Checks"])
for check in checks:
    status = "PASS" if check["ok"] else "FAIL"
    lines.append(f"- [{status}] {check['name']}: {check['detail']}")
lines.append("")
lines.append(f"- overall: `{'PASS' if summary['ok'] else 'FAIL'}`")

md_report.write_text("\n".join(lines) + "\n", encoding="utf-8")

if strict and not summary["ok"]:
    print("Perf smoke strict check failed", file=sys.stderr)
    for item in failed:
        print(f"- {item['name']}: {item['detail']}", file=sys.stderr)
    raise SystemExit(2)
PY

echo "Perf smoke completed"
echo "JSON: $json_report"
echo "MD:   $md_report"
