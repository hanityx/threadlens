# Contributing to ThreadLens

Thanks for your interest. **This project is still in early development.**

We welcome all contributions! However, to avoid wasted effort, please **open an issue or start a discussion** before submitting large Pull Requests (PRs), as the architecture is still evolving.

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
- Run Web tests: `pnpm --filter @threadlens/web test`
- Run Web build: `pnpm --filter @threadlens/web build`
- Run TUI build when terminal surface changes: `pnpm --filter @threadlens/tui build`

These checks must pass before a PR is accepted.

### Project Structure

| Directory | Purpose |
|---|---|
| `apps/api-ts` | Fastify API gateway (TypeScript) |
| `apps/web` | React + Vite dashboard |
| `apps/tui` | Ink terminal workbench |
| `apps/desktop-electron` | Electron desktop shell |
| `packages/shared-contracts` | Shared TypeScript types |

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
- use the public markdown hygiene helper if your checkout provides it

## Documentation

- Keep public docs focused on product behavior, public architecture, and reproducible setup.
- Do not add maintainer-only operating notes or machine-specific instructions to tracked docs.
- If workflow details are only relevant to local operations, they belong outside the public doc surface.

## Reporting Issues

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Node.js version

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
