# ThreadLens Desktop (Electron)

Electron is the primary desktop shell for ThreadLens.

## What It Does

- Opens the React dashboard in a native desktop window
- Supports a live renderer URL for local development
- Falls back to the built web bundle for local file-mode launches
- Starts the bundled Fastify API automatically for desktop production launches
- Keeps browser privileges locked down through a preload bridge and blocked popup windows

## Development

From the repository root:

```bash
pnpm install
API_TS_PORT=8899 pnpm --filter @threadlens/api dev
VITE_API_PROXY_TARGET=http://127.0.0.1:8899 pnpm --filter @threadlens/web dev --host 127.0.0.1 --port 5181
ELECTRON_RENDERER_URL=http://127.0.0.1:5181 pnpm --filter @threadlens/desktop-electron dev
```

## Validation

```bash
pnpm --filter @threadlens/desktop-electron lint
pnpm --filter @threadlens/desktop-electron test
pnpm build:desktop
pnpm package:desktop:dir
pnpm --filter @threadlens/desktop-electron smoke:packaged
pnpm --filter @threadlens/desktop-electron exec electron --version
```

## Packaging

```bash
pnpm build:desktop
pnpm package:desktop:dir
pnpm package:desktop
pnpm package:desktop:win
pnpm package:desktop:linux
```

- Directory build output: `apps/desktop-electron/dist/mac-arm64/ThreadLens.app`
- macOS DMG output: `apps/desktop-electron/dist/*.dmg`
- Windows portable output: `apps/desktop-electron/dist/*.exe`
- Linux AppImage output: `apps/desktop-electron/dist/*.AppImage`
- The packaged app bundles the built web UI and the embedded TS API runner.
- The packaged app runs against the embedded TS API only.
- Security boundary notes live in `apps/desktop-electron/SECURITY.md`.

## Release Trust Chain

- Local packaging is unsigned by default on macOS and Windows.
- The release workflow always publishes:
  - `ThreadLens-<version>-SHA256SUMS.txt`
  - `ThreadLens-<version>-desktop-trust-notes.md`
  - `ThreadLens-<version>-desktop-trust.json`
- macOS signing uses `CSC_LINK` + `CSC_KEY_PASSWORD` or `CSC_NAME`.
- macOS notarization additionally requires one of:
  - `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`
  - `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`
  - `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`
- Windows signing uses `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` or falls back to `CSC_LINK` + `CSC_KEY_PASSWORD`.
- If those secrets are absent, the release trust notes explicitly mark the affected platform artifact unsigned instead of silently assuming a signed distribution.

## Notes

- Electron packaging is unsigned on macOS and Windows by default unless the release workflow receives signing credentials.
- macOS DMG opens with a drag-to-Applications install window.
- If first launch is blocked, use `Right-click -> Open` once, or approve it in `System Settings > Privacy & Security -> Open Anyway`.
- Windows can require `More info` -> `Run anyway` on the first launch when the release trust notes report an unsigned artifact.
- Linux AppImage launches can require `chmod +x`.
