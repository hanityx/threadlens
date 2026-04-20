# Contributing to ThreadLens

Thanks for your interest in contributing to ThreadLens.

We welcome all contributions. To avoid wasted effort, please **open an issue or start a discussion** before submitting changes that span multiple surfaces or introduce new workflows.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Start the dev stack:
   ```bash
   pnpm dev                   # TS API (:8788) + Web UI (:5174)
   pnpm dev:tui               # Optional terminal workbench
   pnpm dev:desktop           # Optional Electron shell
   ```

## Development Workflow

### Before Submitting

- Run API tests: `pnpm --filter @threadlens/api test`
- Run API build: `pnpm --filter @threadlens/api build`
- Run Web tests when the web workbench changes: `pnpm --filter @threadlens/web test`
- Run Web build when the web workbench changes: `pnpm --filter @threadlens/web build`
- Run TUI tests when the terminal workbench changes: `pnpm --filter @threadlens/tui test`
- Run TUI build when the terminal workbench changes: `pnpm --filter @threadlens/tui build`
- Run desktop lint when the Electron shell changes: `pnpm --filter @threadlens/desktop-electron lint`
- Run desktop tests when the Electron shell changes: `pnpm --filter @threadlens/desktop-electron test`
- Run desktop packaging smoke when packaged desktop behavior changes: `pnpm package:desktop:dir && pnpm --filter @threadlens/desktop-electron smoke:packaged`

These checks must pass before a PR is accepted.

### Project Structure

| Directory | Purpose |
|---|---|
| `apps/api-ts` | Fastify API gateway (TypeScript) |
| `apps/web` | React + Vite dashboard |
| `apps/tui` | Ink terminal workbench |
| `apps/desktop-electron` | Electron desktop shell |
| `packages/shared-contracts` | Shared TypeScript types |

For a deeper look at the backend layout and domain split, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Where to Start

- Check [issues labeled `good first issue`](https://github.com/hanityx/threadlens/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for entry-level tasks.
- Provider support improvements (search accuracy, transcript parsing, session metadata) are a good area for first contributions.
- UI consistency fixes in `apps/web/src/` — check [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for what to look for.
- Doc corrections are always welcome without a prior issue.

### Code Style

- TypeScript strict mode throughout
- Zod for request validation (API)
- React Query for data fetching (Web)
- Web stays on React 18 while the Ink TUI currently tracks React 19
- No hardcoded absolute paths — use `os.homedir()` / `path.resolve()` dynamically

### Safety Rules

- **Never** delete local thread/session data without a token-verified flow
- Keep backward compatibility for existing `/api/*` responses
- Prefer incremental migration over large rewrites
- Keep tracked docs and tracked scripts free of machine-specific paths and maintainer-only notes

### Public Markdown Hygiene

If your change touches tracked markdown:

- keep public docs free of local paths, machine-specific traces, and internal codenames

## Documentation

- Keep public docs focused on product behavior, public architecture, and reproducible setup.
- Do not add maintainer-only operating notes or machine-specific instructions to tracked docs.
- If workflow details are only relevant to local operations, they belong outside the public doc surface.

## Reporting Issues

### Bug reports

Open a GitHub bug issue with:
- steps to reproduce
- expected vs actual behavior
- OS, Node.js, and pnpm version
- failing command output or screenshots when available
- the affected surface: `Overview`, `Search`, `Thread`, `Sessions`, `TUI`, `Desktop`, or API/data layer

### Feature requests

Open a GitHub feature request when you want:
- a new provider workflow
- overview, search, thread, or sessions UX changes
- packaging or release-surface improvements

### Security reports

Do **not** open a public issue for vulnerabilities.

Use [SECURITY.md](SECURITY.md) and GitHub private vulnerability reporting instead.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
