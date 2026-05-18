#!/usr/bin/env bash
set -u -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))"
cd "$ROOT"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${THREADLENS_GUI_PASS_OUT_DIR:-$ROOT/.run/gui-pass/$TIMESTAMP}"
LOG_DIR="$OUT_DIR/logs"
SUMMARY_TSV="$OUT_DIR/gui-pass-status.tsv"
SUMMARY_MD="$OUT_DIR/gui-pass-summary.md"
INDEX_HTML="$OUT_DIR/index.html"

mkdir -p "$LOG_DIR"
: >"$SUMMARY_TSV"

run_stage() {
  local name="$1"
  local command="$2"
  local log_file="$LOG_DIR/${name}.log"
  local started_at ended_at duration status result

  echo "==> ${name}"
  started_at="$(date +%s)"
  set +e
  bash -lc "$command" 2>&1 | tee "$log_file"
  status="${PIPESTATUS[0]}"
  set -e
  ended_at="$(date +%s)"
  duration="$((ended_at - started_at))"

  if [[ "$status" -eq 0 ]]; then
    result="PASS"
  else
    result="FAIL"
  fi

  printf "%s\t%s\t%s\t%s\n" "$name" "$result" "$duration" "$log_file" >>"$SUMMARY_TSV"
  echo "<== ${name}: ${result} (${duration}s)"
}

run_stage "web-live-gui" "OUT_DIR='$OUT_DIR/web-live' pnpm test:live"
run_stage "tui-gui" "OUT_DIR='$OUT_DIR/tui' bash tools/qa/tui-smoke.sh"
run_stage "desktop-packaged-gui" "pnpm package:desktop:dir && THREADLENS_SMOKE_ARTIFACT_DIR='$OUT_DIR/desktop' pnpm --filter @threadlens/desktop-electron smoke:packaged"

python3 - "$OUT_DIR" "$SUMMARY_TSV" "$SUMMARY_MD" "$INDEX_HTML" "$TIMESTAMP" <<'PY'
import html
import json
import pathlib
import sys

out_dir = pathlib.Path(sys.argv[1])
summary_tsv = pathlib.Path(sys.argv[2])
summary_md = pathlib.Path(sys.argv[3])
index_html = pathlib.Path(sys.argv[4])
timestamp = sys.argv[5]

rows = []
for line in summary_tsv.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    name, result, duration, log_file = line.split("\t", 3)
    rows.append(
        {
            "name": name,
            "result": result,
            "duration": duration,
            "log": pathlib.Path(log_file),
        }
    )

web_pngs = sorted((out_dir / "web-live").rglob("*.png"))
desktop_pngs = sorted((out_dir / "desktop").rglob("*.png"))
tui_logs = [
    path
    for path in sorted((out_dir / "tui").glob("tui-smoke-*.log"))
    if ".raw." not in path.name
]
desktop_proofs = sorted((out_dir / "desktop").glob("desktop-smoke-proof.json"))

checks = [
    ("web screenshots", len(web_pngs) > 0, f"{len(web_pngs)} PNG files"),
    ("desktop screenshot", len(desktop_pngs) > 0, f"{len(desktop_pngs)} PNG files"),
    ("desktop DOM proof", len(desktop_proofs) > 0, f"{len(desktop_proofs)} JSON files"),
    ("tui text capture", len(tui_logs) > 0, f"{len(tui_logs)} log files"),
]

stage_failures = [row["name"] for row in rows if row["result"] != "PASS"]
proof_failures = [name for name, ok, _detail in checks if not ok]
result = "FAIL" if stage_failures or proof_failures else "PASS"

def rel(path: pathlib.Path) -> str:
    return path.relative_to(out_dir).as_posix()

md_lines = [
    f"# ThreadLens GUI Pass ({timestamp})",
    "",
    f"- Result: `{result}`",
    f"- Output: `{out_dir}`",
    "",
    "## Stages",
    "",
]
for row in rows:
    md_lines.append(
        f"- `{row['name']}`: `{row['result']}` ({row['duration']}s) log: `{rel(row['log'])}`"
    )

md_lines.extend(["", "## Proof Checks", ""])
for name, ok, detail in checks:
    md_lines.append(f"- `{name}`: `{'PASS' if ok else 'FAIL'}` ({detail})")

if stage_failures or proof_failures:
    md_lines.extend(["", "## Failures", ""])
    for name in stage_failures:
        md_lines.append(f"- stage: `{name}`")
    for name in proof_failures:
        md_lines.append(f"- proof: `{name}`")

md_lines.extend(["", "## Screenshots", ""])
for path in web_pngs:
    md_lines.append(f"- Web: `{rel(path)}`")
for path in desktop_pngs:
    md_lines.append(f"- Desktop: `{rel(path)}`")
summary_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

cards = []
for label, paths in [("Web", web_pngs), ("Desktop", desktop_pngs)]:
    for path in paths:
        href = rel(path)
        cards.append(
            f'<figure><a href="{html.escape(href)}"><img src="{html.escape(href)}" alt="{html.escape(label)} screenshot"></a>'
            f'<figcaption>{html.escape(label)}: {html.escape(href)}</figcaption></figure>'
        )

stage_items = "".join(
    f"<li><strong>{html.escape(row['name'])}</strong>: {html.escape(row['result'])} ({html.escape(row['duration'])}s) "
    f'<a href="{html.escape(rel(row["log"]))}">log</a></li>'
    for row in rows
)
proof_items = "".join(
    f"<li><strong>{html.escape(name)}</strong>: {'PASS' if ok else 'FAIL'} ({html.escape(detail)})</li>"
    for name, ok, detail in checks
)
tui_items = "".join(
    f'<li><a href="{html.escape(rel(path))}">{html.escape(rel(path))}</a></li>'
    for path in tui_logs
)
desktop_proof_items = []
for proof_path in desktop_proofs:
    try:
        proof = json.loads(proof_path.read_text(encoding="utf-8"))
        signals = proof.get("renderer", {}).get("signals", {})
    except Exception:
        signals = {}
    signal_text = ", ".join(f"{key}={value}" for key, value in signals.items()) or "signals unavailable"
    desktop_proof_items.append(
        f'<li><a href="{html.escape(rel(proof_path))}">{html.escape(rel(proof_path))}</a> '
        f"<code>{html.escape(signal_text)}</code></li>"
    )

index_html.write_text(
    f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ThreadLens GUI Pass {html.escape(timestamp)}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #172033; background: #f7f8fb; }}
    h1, h2 {{ margin: 0 0 12px; }}
    section {{ margin: 0 0 24px; }}
    .result {{ display: inline-block; padding: 4px 8px; border-radius: 6px; font-weight: 700; background: {"#d9fbe5" if result == "PASS" else "#ffe1df"}; }}
    ul {{ padding-left: 20px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }}
    figure {{ margin: 0; padding: 12px; background: white; border: 1px solid #d9dfeb; border-radius: 8px; }}
    img {{ width: 100%; height: auto; border: 1px solid #c8d0df; border-radius: 4px; background: white; }}
    figcaption {{ margin-top: 8px; font-size: 12px; color: #4f5d75; word-break: break-all; }}
    code {{ font-size: 12px; }}
  </style>
</head>
<body>
  <h1>ThreadLens GUI Pass</h1>
  <p><span class="result">{html.escape(result)}</span> <code>{html.escape(timestamp)}</code></p>
  <section>
    <h2>Stages</h2>
    <ul>{stage_items}</ul>
  </section>
  <section>
    <h2>Proof Checks</h2>
    <ul>{proof_items}</ul>
  </section>
  <section>
    <h2>Screenshots</h2>
    <div class="grid">{''.join(cards)}</div>
  </section>
  <section>
    <h2>TUI Captures</h2>
    <ul>{tui_items}</ul>
  </section>
  <section>
    <h2>Desktop DOM Proof</h2>
    <ul>{''.join(desktop_proof_items)}</ul>
  </section>
</body>
</html>
""",
    encoding="utf-8",
)

print(f"Summary: {summary_md}")
print(f"Index:   {index_html}")

if result != "PASS":
    sys.exit(1)
PY
