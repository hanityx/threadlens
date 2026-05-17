# ThreadLens QA Gates

ThreadLens uses risk-based QA gates. The goal is not to repeat the full
Electron, TUI, and Web manual pass for every small change. The goal is to run
the nearest deterministic checks on every PR, then promote to live and packaged
smoke only when the changed surface can break runtime integration.

## Every PR

Run this for ordinary code changes:

```sh
pnpm qa:pr
```

This covers type checks, dependency boundaries, unit tests across packages, and
the mocked Web e2e flow.

## Provider/API Boundary Changes

Run this when changing provider adapters, provider services, API payload shapes,
auth, CORS, base URL resolution, direct versioned payload parsing, or shared
contracts:

```sh
pnpm qa:provider
```

Add the nearest surface tests for each touched client:

- API route or contract tests for server behavior.
- Web hook/model tests for browser behavior.
- TUI API tests for terminal client behavior.

## Desktop Runtime Changes

Run this when changing packaged Electron startup, preload/IPC, desktop API
lifecycle, packaged assets, or renderer-to-local-API auth:

```sh
pnpm qa:desktop
```

The packaged smoke must verify both the main-process health check and a renderer
fetch that uses the desktop auth bridge.

## Live Web Stack

Run this when changing Web/API integration behavior that mocked e2e cannot prove:

```sh
pnpm qa:live
```

The live Web e2e target should be a dev api-ts process. Do not point standalone
Vite live e2e at the packaged Electron API on port 8788 unless the test has a
way to obtain the desktop IPC token.

## Release Candidate

Before tagging or publishing a release, run:

```sh
pnpm qa:pr
pnpm qa:provider
pnpm qa:desktop
pnpm qa:live
```

Then do a short manual pass for the three product surfaces:

- Packaged Electron: launch app, verify the dashboard renders, run safe dry-run
  flows, and confirm destructive actions still require previews/tokens.
- Web: run the primary search, sessions, transcript, and cleanup dry-run flows
  against a dev api-ts backend.
- TUI: run the same API-backed search, sessions, transcript, and cleanup dry-run
  flows from the terminal client.

## External Review Trigger

Use Oracle/Pro review for high-risk changes only:

- Provider contract, adapter registry, auth, CORS, or direct payload changes.
- Packaged Electron API lifecycle, preload, or renderer bridge changes.
- Cross-surface endpoint semantics shared by API, Web, and TUI.
- Release candidates.

For normal PRs, local automated gates plus nearest tests are the default.
