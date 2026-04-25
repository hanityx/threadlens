<h1>
  <img src="apps/web/public/favicon.svg" alt="ThreadLens icon" width="28" />
  ThreadLens
</h1>

<p align="left">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-%3E%3D22.12-blue" alt="Node" /></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm-%3E%3D10.33.2-orange" alt="pnpm" /></a>
  <a href="https://github.com/hanityx/threadlens/actions/workflows/ci.yml"><img src="https://github.com/hanityx/threadlens/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Codex-111111?style=flat-square&logo=openai&logoColor=white&labelColor=111111&color=111111" alt="Codex" />
  <img src="https://img.shields.io/badge/Claude-111111?style=flat-square&logo=anthropic&logoColor=white&labelColor=111111&color=111111" alt="Claude" />
  <img src="https://img.shields.io/badge/Gemini-111111?style=flat-square&logo=googlegemini&logoColor=white&labelColor=111111&color=111111" alt="Gemini" />
  <img src="https://img.shields.io/badge/Copilot-111111?style=flat-square&logo=githubcopilot&logoColor=white&labelColor=111111&color=111111" alt="Copilot" />
</p>

English | [한국어](docs/README.ko.md)

Local AI conversations pile up. ThreadLens lets you find them, read them, and clean them up safely.

Search across Codex, Claude, Gemini, and Copilot, inspect transcripts, back up session files, and delete only what you mean to — with dry-run confirmation before any file is touched.

## Overview

<p align="center">
  <img src="docs/assets/readme-overview-v4.png" alt="ThreadLens overview dashboard" />
</p>

<p align="center">
  <sub>Overview shows recent activity, provider health, and runtime signals across all connected providers.</sub>
</p>

## Demo

<p align="center">
  <img src="docs/assets/threadlens-demo.gif" alt="ThreadLens search and session transcript demo" />
</p>

<p align="center">
  <sub>Search by keyword across all providers, open a session, and read the transcript — no provider-specific folders to navigate.</sub>
</p>

## Core Workflows

<p align="center">
  <img src="docs/assets/readme-search-sessions-composite.png" alt="ThreadLens search and sessions surfaces" />
</p>

<p align="center">
  <sub>Search finds conversations by phrase across all providers. Sessions opens the raw session files, transcripts, and file-level actions.</sub>
</p>

<p align="center">
  <img src="docs/assets/readme-tui-search.png" alt="ThreadLens TUI search view" width="49.5%" />
  <img src="docs/assets/readme-tui-sessions.png" alt="ThreadLens TUI sessions view" width="49.5%" />
</p>

<p align="center">
  <sub>The TUI brings the same search and session workflows to the terminal, keyboard-first.</sub>
</p>

## Features

- **Multi-provider search** — find any conversation across Codex, Claude, Gemini, and Copilot by phrase or keyword
- **Transcript review** — open session files and read full transcripts without hunting through provider-specific folders
- **Backup first** — back up any session file before touching it; backup copies land in a timestamped local directory
- **Safe cleanup** — every destructive action requires a dry-run first; a confirm token gates the actual execute
- **Codex thread review** — dedicated workflow for inspecting thread impact and running targeted cleanup
- **Terminal workbench** — keyboard-first TUI that shares the same provider scope and local API
- **Web, TUI, and desktop** — all surfaces run against the same local Fastify API; no cloud required

## Getting Started

Runtime baseline: Node.js 22.12+ and pnpm 10.33.2+. The local `.nvmrc` pins the minimum Node 22 baseline used for development, while CI runs the supported Node 22 line.

```bash
pnpm install
pnpm dev
```

- Web UI: `http://127.0.0.1:5174`
- API: `http://127.0.0.1:8788`

```bash
pnpm dev:tui      # terminal workbench
pnpm dev:desktop  # Electron shell
```

## Desktop

Packages for macOS, Windows, and Linux are available via GitHub Releases. Local builds are unsigned by default — see [`apps/desktop-electron/README.md`](apps/desktop-electron/README.md) for build and signing details.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Workflows](docs/WORKFLOWS.md)
- [Provider support](docs/PROVIDER_SUPPORT.md)
- [TUI guide](docs/TUI.md)
- [Design system](docs/DESIGN_SYSTEM.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, issue reporting, and the PR checklist.

## Security

Report vulnerabilities via [SECURITY.md](SECURITY.md) and GitHub private vulnerability reporting.

## License

[MIT](LICENSE)
