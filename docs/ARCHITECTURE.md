# ThreadLens Architecture

ThreadLens uses one local Fastify backend shared by web, TUI, and desktop.

## Runtime

- API: `127.0.0.1:8788`
- Web dev server: `127.0.0.1:5174`
- Unknown `/api/*` paths return `404`
- Desktop packaging bundles the built web UI and starts the bundled local API with a per-launch token

## Surfaces

- `apps/web`: React workbench for `Overview`, `Search`, `Thread` (`threads` route), and `Sessions` (`providers` route)
- `apps/tui`: Ink terminal workbench for `Search`, `Sessions`, and `Cleanup`
- `apps/desktop-electron`: Electron shell that starts the bundled local API
- `apps/api-ts`: Fastify runtime and domain logic
- `packages/shared-contracts`: shared API envelope and contract types

## Workflow Split

- `Conversation Search`: raw conversation lookup for the shared searchable-provider contract, currently `Codex`, `Claude`, `Gemini`, and `Copilot`
- `Sessions`: provider session files, transcripts, and file-level actions
- `Thread`: Codex thread review, impact analysis, and cleanup execution
- `Diagnostics`: runtime, parser, data-source, recovery, and execution-flow views

## Route Groups

`apps/api-ts/src/app/routes`

- `platform.ts`: health, version, runtime, overview, recovery, smoke, execution graph, alert hooks, agent loops
- `providers.ts`: provider matrix, sessions, parser health, conversation search, session transcripts, provider session actions
- `threads.ts`: thread list, thread mutations, forensics, impact analysis, local cleanup

## Backend Layout

`apps/api-ts/src`

```text
app/
  create-server.ts
  routes/
    platform.ts
    providers.ts
    threads.ts
domains/
  providers/
    matrix.ts
    path-safety.ts
    probe.ts
    search-helpers.ts
    search.ts
    actions.ts
    title-detection.ts
    transcript.ts
    types.ts
  threads/
    query.ts
    cleanup.ts
    forensics.ts
    impact.ts
    metadata.ts
    overview.ts
    state.ts
    thread-id.ts
  recovery/
    inventory.ts
    roadmap.ts
  ops/
    observatory.ts
    alert-hooks.ts
    agent-loops.ts
lib/
  constants.ts
  providers.ts
  recovery.ts
  update-check.ts
  utils.ts
```

This tree lists the main runtime modules. Tests, fixtures, and narrow helper files are omitted for readability.

## Web Layout

`apps/web/src` is split into app shell, feature surfaces, shared state, and shared UI primitives.

```text
app/                 shell, top navigation, detail rail, app-level hooks
features/
  overview/          setup, activity, and runtime summary
  search/            cross-provider conversation search
  providers/         Sessions surface, parser health, routing, backups, provider actions
  threads/           Thread review, forensics, impact, and cleanup
shared/              API helpers, preferences, contracts, formatters, UI components
i18n/                localized message catalogs and locale loading
```

## Rules

- `create-server.ts` stays focused on bootstrap and route registration
- Route handlers register HTTP; domain logic lives under `domains/`
- `lib/` stays for shared constants and focused helpers
- Web, TUI, and desktop reuse the same API contracts

## Safety

- Destructive actions use `dry-run -> confirm token -> execute`
- Session reads and writes validate provider roots first
- Backup information stays close to destructive actions
- Packaged desktop API requests require the per-launch desktop token
- The API is for local single-user use and should not be exposed to untrusted networks
