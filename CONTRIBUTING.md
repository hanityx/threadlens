# Contributing to ThreadLens

Thanks for your interest in contributing to ThreadLens.

We welcome all contributions. To avoid wasted effort, please **open an issue or start a discussion** before submitting changes that span multiple surfaces or introduce new workflows.

## Getting Started

1. Fork and clone the repository
2. Use Node.js 22.12+ and pnpm 10.33.2+ (`.nvmrc` pins the supported Node baseline)
3. Install dependencies: `pnpm install`
4. Start the dev stack:
   ```bash
   pnpm dev                   # TS API (:8788) + Web UI (:5174)
   pnpm dev:tui               # Optional terminal workbench
   pnpm dev:desktop           # Optional Electron shell
   ```

## Development Workflow

### Before Submitting

```bash
pnpm test    # all packages
pnpm build   # shared-contracts + api + web
pnpm lint    # all packages
```

Surface-specific changes additionally require:

```bash
pnpm build:tui                                  # terminal workbench changes
pnpm --filter @threadlens/web test:e2e          # web workflow changes
pnpm package:desktop:dir && pnpm --filter @threadlens/desktop-electron smoke:packaged  # desktop changes
```

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

- Browse [open issues](https://github.com/hanityx/threadlens/issues) or open a new one to propose an improvement
- Provider support improvements (search accuracy, transcript parsing, session metadata)
- UI consistency fixes in `apps/web/src/` — check [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for patterns
- Doc corrections are always welcome without a prior issue

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

## Documentation

Keep public docs focused on product behavior, public architecture, and reproducible setup. If your change touches tracked markdown:

- No local paths, machine-specific traces, or internal codenames
- No maintainer-only operating notes — those belong outside the tracked doc surface

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
