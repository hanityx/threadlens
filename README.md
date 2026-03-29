# ThreadLens

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-blue)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-orange)](https://pnpm.io)
[![CI](https://github.com/threadlens/threadlens/actions/workflows/ci.yml/badge.svg)](https://github.com/threadlens/threadlens/actions/workflows/ci.yml)

ThreadLens is a local-first workbench for AI session search, session-file review, and safe Codex cleanup.

Search local conversations across Codex, Claude, Gemini, and Copilot, inspect transcripts, back up session files, and run cleanup behind dry-run guardrails.

<p align="center">
  <img src="docs/assets/readme-overview.png" alt="ThreadLens overview surface" width="100%"/>
</p>

## Screen Preview

Temporary gallery structure. Replace these placeholder images with final captures for the current web surfaces.

| Overview | Search |
| --- | --- |
| ![ThreadLens overview placeholder](docs/assets/readme-overview.png) | ![ThreadLens search placeholder](docs/assets/readme-overview.png) |
| Main workbench and readiness view | Cross-provider conversation lookup |

| Thread | Sessions |
| --- | --- |
| ![ThreadLens thread placeholder](docs/assets/readme-overview.png) | ![ThreadLens sessions placeholder](docs/assets/readme-overview.png) |
| Codex thread review, impact analysis, and cleanup dry-run | Session inspection, transcript preview, and provider actions |

## Highlights

- `Conversation Search` finds the right session before you decide whether it belongs in `Sessions` or `Thread`.
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
- `sync-lens` is available as an optional read-only comparison surface for Codex state across machines

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Workflows: `docs/WORKFLOWS.md`
- Provider support: `docs/PROVIDER_SUPPORT.md`
- TUI guide: `docs/TUI.md`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Support

See [SUPPORT.md](SUPPORT.md) for bug-report, feature-request, and release-support guidance.

## License

[MIT](LICENSE)
