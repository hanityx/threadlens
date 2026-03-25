#!/usr/bin/env bash
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_SVG="${THREADLENS_ICON_SOURCE:-$DESKTOP_ROOT/../web/public/favicon.svg}"
OUTPUT_DIR="$DESKTOP_ROOT/build"
OUTPUT_ICON="$OUTPUT_DIR/icon.icns"
TMP_DIR="$OUTPUT_DIR/tmp_icon"
ICONSET_DIR="$TMP_DIR/icon.iconset"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -f "$SOURCE_SVG" ]]; then
  echo "[build-app-icon] source svg missing: $SOURCE_SVG" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR" "$ICONSET_DIR"

qlmanage -t -s 1024 -o "$TMP_DIR" "$SOURCE_SVG" >/dev/null 2>&1
SOURCE_PNG="$TMP_DIR/$(basename "$SOURCE_SVG").png"

if [[ ! -f "$SOURCE_PNG" ]]; then
  echo "[build-app-icon] failed to render png from $SOURCE_SVG" >&2
  exit 1
fi

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$SOURCE_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  retina_size=$((size * 2))
  sips -z "$retina_size" "$retina_size" "$SOURCE_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICON"
echo "[build-app-icon] wrote $OUTPUT_ICON"
