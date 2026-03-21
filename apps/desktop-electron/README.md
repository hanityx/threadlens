# Provider Observatory Desktop (Electron)

Electron is the primary desktop shell for Provider Observatory.

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
API_TS_PORT=8899 pnpm --filter @provider-surface/api dev
VITE_API_PROXY_TARGET=http://127.0.0.1:8899 pnpm --filter @provider-surface/web dev --host 127.0.0.1 --port 5181
ELECTRON_RENDERER_URL=http://127.0.0.1:5181 pnpm --filter @provider-surface/desktop-electron dev
```

## Validation

```bash
pnpm --filter @provider-surface/desktop-electron lint
pnpm build:desktop
pnpm package:desktop:dir
pnpm --filter @provider-surface/desktop-electron exec electron --version
```

## Packaging

```bash
pnpm build:desktop
pnpm package:desktop:dir
pnpm package:desktop
```

- Directory build output: `apps/desktop-electron/dist/mac-arm64/Provider Observatory.app`
- Zip output: `apps/desktop-electron/dist/*.zip`
- The packaged app bundles the built web UI and the embedded TS API runner.
- The packaged app runs against the embedded TS API only.

## Notes

- Electron packaging is wired for unsigned local macOS builds.
