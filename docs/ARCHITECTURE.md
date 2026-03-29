# ThreadLens Architecture

ThreadLens uses one local Fastify backend shared by web, TUI, and desktop.

## Runtime

- API: `127.0.0.1:8788`
- Web dev server: `127.0.0.1:5174`
- Unknown `/api/*` paths return `404`
- Desktop packaging reuses the same web + API stack

## Surfaces

- `apps/web`: React workbench for `Overview`, `Search`, `Sessions`, and `Cleanup`
- `apps/tui`: Ink terminal workbench for `Search`, `Sessions`, and `Cleanup`
- `apps/desktop-electron`: Electron shell that starts the bundled local API
- `apps/api-ts`: Fastify runtime and domain logic
- `packages/shared-contracts`: shared API envelope and contract types

## Workflow Split

- `Conversation Search`: cross-provider raw conversation lookup
- `Sessions`: provider session files, transcripts, and file-level actions
- `Cleanup`: Codex thread review, impact analysis, and cleanup execution
- `Diagnostics`: runtime, parser, data-source, recovery, and execution-flow views

## Route Groups

`apps/api-ts/src/app/routes`

- `platform.ts`: health, version, runtime, overview, recovery, smoke, sync lens, execution graph, alert hooks, agent loops
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
    search.ts
    transcript.ts
    actions.ts
  threads/
    query.ts
    cleanup.ts
    forensics.ts
    overview.ts
    state.ts
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
  sync-lens.ts
  utils.ts
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
- The API is for local single-user use and should not be exposed to untrusted networks
- `sync-lens` is optional and read-only; it requires `SYNC_LENS_REMOTE_ALIAS`, `ssh`, and `python3`
