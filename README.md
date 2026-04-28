<h1>
  <img src="apps/web/public/favicon.svg" alt="" width="28" />
  ThreadLens
</h1>

<p align="left">
  <a href="https://github.com/hanityx/threadlens/releases/latest"><img src="https://img.shields.io/github/v/release/hanityx/threadlens?label=latest&color=4f46e5" alt="release" /></a>
  <a href="https://github.com/hanityx/threadlens/actions/workflows/ci.yml"><img src="https://github.com/hanityx/threadlens/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e.svg" alt="MIT" /></a>
</p>

<p align="left">
  <img src="https://img.shields.io/badge/Codex-111111?style=flat-square&logo=openai&logoColor=white" alt="Codex" />
  <img src="https://img.shields.io/badge/Claude-111111?style=flat-square&logo=anthropic&logoColor=white" alt="Claude" />
  <img src="https://img.shields.io/badge/Gemini-111111?style=flat-square&logo=googlegemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Copilot-111111?style=flat-square&logo=githubcopilot&logoColor=white" alt="Copilot" />
</p>

[한국어](docs/README.ko.md) · [中文](docs/README.zh-CN.md) · [日本語](docs/README.ja.md) · [Español](docs/README.es.md) · [Português](docs/README.pt-BR.md)

---

You remember the conversation — you just don't know if it was Codex, Claude, Gemini, or Copilot.

ThreadLens lets you search, open and review conversations, analyze impact, back up, and safely clean up your local AI sessions from one place. No cloud, no account — just the sessions already on your machine.

<img src="docs/assets/threadlens-demo-en-compact.gif" alt="ThreadLens demo" width="100%" />

---

| Before | With ThreadLens |
|---|---|
| Grep through hidden provider folders | Search across Codex, Claude, Gemini, and Copilot at once |
| Forget which tool had the answer | Open matching transcripts directly |
| Cleanup requires touching files directly | Backup first, review impact, then clean up safely |
| Desktop, web, and terminal workflows drift apart | Same local API across desktop, web, and TUI |

## Features

- **Search** — find sessions across Codex, Claude, Gemini, and Copilot with a single keyword.
- **Transcript** — open full conversations without navigating provider-specific folders.
- **Safe cleanup** — back up, dry-run, and confirm token before any destructive action.
- **Thread review** — inspect Codex thread scope, related sessions, and audit history.
- **Provider health** — provider status, session discovery flow, and path/config issues on one screen.
- **TUI** — the same workflows in your terminal, keyboard-first.

See [Provider support](docs/PROVIDER_SUPPORT.md) for path details, limitations, and current support scope.

## Getting Started

### Desktop

[macOS .dmg ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0-arm64.dmg) · [Windows .exe ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens.0.3.0.exe) · [Linux .AppImage ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0.AppImage)

macOS and Windows builds are unsigned.

### Source

Requires Node.js 22.12+ and pnpm 10.33.2+.

```bash
git clone https://github.com/hanityx/threadlens.git
cd threadlens
pnpm install && pnpm dev
```

| Command | Description |
|---|---|
| `pnpm dev` | web UI :5174 · API :8788 |
| `pnpm dev:tui` | terminal workbench |
| `pnpm dev:desktop` | Electron desktop |

## Roadmap

Upcoming releases focus on:

- **0.3.x** — bug fixes and release stability, provider reliability improvements, general UX improvements
- **0.4** — session navigation, backup visibility, error guidance, session impact analysis

## Documentation

- [Workflows](docs/WORKFLOWS.md)
- [Provider support](docs/PROVIDER_SUPPORT.md)
- [Security](SECURITY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [TUI guide](docs/TUI.md)

## Contributing

Bug reports, feature suggestions, provider support improvements, and code contributions of all kinds are welcome.

## License

MIT
