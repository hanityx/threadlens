# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation
- Refresh public docs around product workflows, provider support, and terminal usage
- Align README and architecture docs with the current web, TUI, desktop, and shared API surface

## [0.1.0] - 2026-03-01

### Added
- Initial open-source release
- Fastify API gateway with 35+ TS-native endpoints
- React dashboard with thread operations, provider matrix, forensics, and routing panels
- Multi-provider observability (Codex, Claude, Gemini, Copilot)
- Provider session scanning with parse-quality diagnostics
- Two-step token-verified cleanup flow (dry-run + confirm)
- Recovery center with drill and checklist
- Execution graph visualization
- Electron desktop shell with macOS bundling
- Shared TypeScript contracts package

### Architecture
- `apps/api-ts/src/server.ts` — route registration (~850 lines)
- `apps/api-ts/src/lib/` — modular business logic (constants, utils, providers, recovery)
- `apps/web/src/App.tsx` — pure layout component (~270 lines)
- `apps/web/src/hooks/useAppData.ts` — centralized state/query/mutation hook
- `apps/web/src/components/` — 8 extracted UI components
