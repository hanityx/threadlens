# ThreadLens

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-blue)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-orange)](https://pnpm.io)
[![CI](https://github.com/threadlens/threadlens/actions/workflows/ci.yml/badge.svg)](https://github.com/threadlens/threadlens/actions/workflows/ci.yml)

Local-first workbench for searching, reviewing, backing up, and safely cleaning up local AI conversations across Codex, Claude CLI, Gemini CLI, and related local session sources.

<p align="center">
  <img src="docs/assets/readme-overview.png" alt="ThreadLens overview surface" width="100%"/>
</p>

ThreadLens is built around four operator workflows:
- `Conversation Search` for finding the exact phrase, filename, or session note first
- `Source Sessions` for browsing transcripts, backing up raw files, and exporting recovery bundles
- `Cleanup` for Codex thread review, impact analysis, archive actions, and dry-runs
- `AI Diagnostics` for path, parser, and execution-flow inspection across providers

## What It Does

- Search raw conversation text before deciding whether the result belongs in Cleanup or Sessions.
- Review Codex cleanup candidates with impact analysis and dry-run guardrails.
- Inspect transcript files from supported providers without diving through local storage by hand.
- Keep backup and recovery actions close to the data they affect.
- Use the same local runtime from the web app, terminal workbench, or desktop shell.

## Tech Stack
- TUI: Ink + React 19
- Desktop: Electron
- API: Node.js + TypeScript + Fastify
- Runtime: TypeScript-only Fastify API
- Web UI: React 18 + Vite

## Optional Remote Sync Lens

`/api/sync-lens` is an optional read-only comparison surface for operators who
want to compare the local Codex state against a second machine.

- Set `SYNC_LENS_REMOTE_ALIAS=<ssh-alias>` before starting `@threadlens/api`
- The remote host must provide `ssh` access and `python3`
- Strict host-key checks stay enabled by default

## Getting Started

```bash
pnpm install
pnpm dev
pnpm dev:tui      # optional terminal workbench
pnpm dev:desktop  # optional Electron shell
```

Web UI: `http://127.0.0.1:5174`  
TS API: `http://127.0.0.1:8788`

## Terminal Workbench

```bash
pnpm dev:api
pnpm dev:tui

pnpm start:tui
pnpm start:tui -- --query obsidian
pnpm start:tui -- --query obsidian --results
pnpm start:tui -- --view sessions --provider codex
pnpm start:tui -- --view sessions --provider codex --filter 019cecd0
pnpm start:tui -- --view cleanup --filter risk
```

Keymap highlights:
- `1 / 2 / 3`: Search / Sessions / Cleanup
- `?`: help overlay
- Search: type directly, `Enter`/`Ctrl+N`/`Tab` results focus, `/` or `i` query focus
- Sessions: `[` `]` provider scope, `b` backup, `a` archive dry-run, `d` delete dry-run
- Cleanup: `space` select, `a` analyze, `d` dry-run, `D` execute

## Desktop Build

```bash
pnpm build:desktop
pnpm package:desktop:dir
pnpm package:desktop
```

Expected outputs:
- `.app`: `apps/desktop-electron/dist/mac-arm64/ThreadLens.app`
- `.zip`: `apps/desktop-electron/dist/*.zip`

## Repository Structure

- `apps/api-ts` Fastify API runtime
- `apps/web` React workbench
- `apps/tui` Ink terminal workbench
- `apps/desktop-electron` Electron shell
- `packages/shared-contracts` shared contracts and schema surface
- `docs` public architecture, product, troubleshooting, and release notes

## Core Commands

```bash
pnpm --filter @threadlens/api test
pnpm --filter @threadlens/api build
pnpm --filter @threadlens/web test
pnpm --filter @threadlens/web build
pnpm --filter @threadlens/tui build
pnpm build:desktop
```

## Docs

- Architecture: `docs/ARCHITECTURE.md`
- Internal release, troubleshooting, and product notes live under `docs/private-notes/`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Support

See [SUPPORT.md](SUPPORT.md) for bug-report, feature-request, and release-support guidance.

## License

[MIT](LICENSE)
