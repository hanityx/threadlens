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
- macOS zip output: `apps/desktop-electron/dist/*.zip`
- Windows portable output: `apps/desktop-electron/dist/*.exe`
- Linux AppImage output: `apps/desktop-electron/dist/*.AppImage`
- The packaged app bundles the built web UI and the embedded TS API runner.
- The packaged app runs against the embedded TS API only.

## Notes

- Electron packaging is unsigned on macOS and Windows by default.
- macOS can require `Open` from the context menu once, or approval in `System Settings > Privacy & Security`.
- Windows can require `More info` -> `Run anyway` on the first launch.
- Linux AppImage launches can require `chmod +x`.
