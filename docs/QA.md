# ThreadLens Testing

ThreadLens uses layered test scripts. Most changes should run the smallest
deterministic check that covers the changed code path. Add live or packaged
smoke tests when the change can break runtime integration.

## Pull Requests

Run this for ordinary code changes:

```sh
pnpm test:ci
```

This covers type checks, dependency boundaries, unit tests across packages, and
the mocked Web e2e flow.

## Provider/API Boundary Changes

Run this when changing provider adapters, provider services, API payload shapes,
auth, CORS, base URL resolution, direct versioned payload parsing, or shared
contracts:

```sh
pnpm test:provider
```

Add the nearest surface tests for each touched client:

- API route or contract tests for server behavior.
- Web hook/model tests for browser behavior.
- TUI API tests for terminal client behavior.

## Desktop Runtime Changes

Run this when changing packaged Electron startup, preload/IPC, desktop API
lifecycle, packaged assets, or renderer-to-local-API auth:

```sh
pnpm test:desktop
```

The packaged smoke must verify both the main-process health check and a renderer
fetch that uses the desktop auth bridge.

## Live Web Stack

Run this when changing Web/API integration behavior that mocked e2e cannot prove:

```sh
pnpm test:live
```

The live Web e2e target should be a dev api-ts process. Do not point standalone
Vite live e2e at the packaged Electron API on port 8788 unless the test has a
way to obtain the desktop IPC token.

## Release Candidate

Before tagging or publishing a release, run:

```sh
pnpm test:ci
pnpm test:provider
pnpm test:desktop
pnpm test:live
pnpm test:smoke
```

`test:smoke` is a short smoke pass for the three runtime surfaces:

- Packaged Electron: launch the packaged app and verify renderer + local API
  startup.
- Web: run the live browser smoke against a dev api-ts backend.
- TUI: run an API-backed terminal smoke in a pseudo-tty.

If the release changes user flows, manually check the touched search, sessions,
transcript, or cleanup dry-run paths as well.

## External Review Trigger

Use external review for high-risk changes only:

- Provider contract, adapter registry, auth, CORS, or direct payload changes.
- Packaged Electron API lifecycle, preload, or renderer bridge changes.
- Cross-surface endpoint semantics shared by API, Web, and TUI.
- Release candidates.

For normal PRs, local automated scripts plus the nearest package tests are the
default.
