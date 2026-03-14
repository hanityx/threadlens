# Contributing to Codex Mission Control

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Start the dev stack:
   ```bash
   python3 server.py          # Python backend on :8787
   pnpm dev                   # TS API (:8788) + Web UI (:5174)
   ```

## Development Workflow

### Before Submitting

- Run API tests: `pnpm --filter @codex/api-ts test`
- Run API build: `pnpm --filter @codex/api-ts build`
- Run Web build: `pnpm --filter @codex/web build`

All three must pass before a PR is accepted.

### Project Structure

| Directory | Purpose |
|---|---|
| `apps/api-ts` | Fastify API gateway (TypeScript) |
| `apps/web` | React + Vite dashboard |
| `apps/desktop-tauri` | Tauri v2 desktop shell |
| `packages/shared-contracts` | Shared TypeScript types |
| `server.py` | Legacy Python backend |

### Code Style

- TypeScript strict mode throughout
- Zod for request validation (API)
- React Query for data fetching (Web)
- No hardcoded absolute paths — use `os.homedir()` / `path.resolve()` dynamically

### Safety Rules

- **Never** delete local thread/session data without a token-verified flow
- Keep backward compatibility for existing `/api/*` responses
- Prefer incremental migration over large rewrites

## Reporting Issues

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Node.js version

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
