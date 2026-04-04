<h1>
  <img src="apps/web/public/favicon.svg" alt="ThreadLens icon" width="24" />
  ThreadLens
</h1>

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-blue)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-orange)](https://pnpm.io)
[![CI](https://github.com/hanityx/threadlens/actions/workflows/ci.yml/badge.svg)](https://github.com/hanityx/threadlens/actions/workflows/ci.yml)

ThreadLens is a local-first workbench for AI conversation search, provider-session review, and safe thread cleanup.

Search local conversations across Codex, Claude, Gemini, and Copilot, inspect transcripts, back up session files, and stop destructive work behind dry-run guardrails.

## Overview

<p align="center">
  <img src="docs/assets/readme-overview-v4.png" alt="ThreadLens overview dashboard" />
</p>

<p align="center">
  <sub>Start in Overview for recent activity, provider health, runtime recovery, and the default AI.</sub>
</p>

## Core Workflows

<p align="center">
  <img src="docs/assets/readme-search-sessions-composite.png" alt="ThreadLens search and sessions surfaces" />
</p>

<p align="center">
  <sub>Start in Search when you know the phrase, then switch to Sessions for raw provider files and transcript detail.</sub>
</p>

## Highlights

- `Conversation Search` finds the right session or thread before you pick a workflow.
- `Sessions` opens provider session files, transcript previews, and backup-first file actions.
- `Thread` gives Codex thread review, impact analysis, and dry-run token execution in a dedicated workflow.
- `Overview Setup` can save one default AI so `Sessions` and `Search` reopen from the same starting point.
- `Diagnostics` exposes runtime, parser, data-source, recovery, and execution-flow signals from the same local runtime.
- Web, TUI, and desktop all reuse the same Fastify API surface.

## Getting Started

```bash
pnpm install
pnpm dev
```

Default local endpoints:

- Web UI: `http://127.0.0.1:5174`
- TS API: `http://127.0.0.1:8788`

Optional surfaces:

- `pnpm dev:tui` starts the terminal workbench
- `pnpm dev:desktop` starts the Electron shell in development mode

## Desktop Build Note

- Desktop packaging is available for macOS, Windows, and Linux.
- macOS builds are unsigned local app bundles. First launch can trigger Gatekeeper. Use `Open` from the context menu once, or allow the app in `System Settings > Privacy & Security`.
- Windows portable builds can show SmartScreen. Use `More info` -> `Run anyway` on the first launch.
- Linux AppImage builds need `chmod +x ThreadLens-*.AppImage` before launch.
- Packaged outputs land in `apps/desktop-electron/dist/`.
- Desktop-specific build details live in `apps/desktop-electron/README.md`.

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Workflows: `docs/WORKFLOWS.md`
- Provider support: `docs/PROVIDER_SUPPORT.md`
- TUI guide: `docs/TUI.md`

## Contributing

For development guidelines, read [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

For vulnerability reporting, read [SECURITY.md](SECURITY.md).

## Support

For bug reports, feature requests, and release support, read [SUPPORT.md](SUPPORT.md).

## License

[MIT](LICENSE)
