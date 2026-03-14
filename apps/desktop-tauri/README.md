# Codex Mission Control Desktop (Tauri)

## Prerequisites
- Rust toolchain (`rustup`, `cargo`)
- Xcode Command Line Tools (macOS)
- Node 20+

## Dev boot
1. Start legacy Python backend (port 8787):
   - `python3 server.py`  (from repo root)
2. Start TS API + web:
   - `pnpm dev`  (from repo root)
3. Run Tauri shell:
   - `cd apps/desktop-tauri && pnpm dev`

The shell loads `http://127.0.0.1:5174` and calls API on `http://127.0.0.1:8788`.
