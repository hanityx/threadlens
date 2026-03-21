# Provider Observatory Architecture

This repository now serves product/runtime traffic through a TypeScript-first
architecture and keeps `legacy/server.py` only as legacy admin/offline tooling.

## Product runtime

- `apps/web`
  - React UI for search, cleanup, sessions, and diagnostics
- `apps/api-ts`
  - Fastify API
  - Owns all product/runtime domains
  - Unknown `/api/*` paths return `404`
- `apps/desktop-electron`
  - Desktop shell, local API bootstrap, packaging
- `legacy/server.py`
  - Legacy admin/offline tool
  - No longer required for product/runtime routes
  - Retained only for legacy admin/offline tooling during final retirement

## Current backend split

### TS-native now

- provider matrix, provider sessions, parser health
- conversation search
- session transcript reads
- threads read path
- thread rename
- thread forensics
- thread pin
- thread archive-local
- thread resume-command
- codex observatory
- analyze-delete
- local-cleanup
- recovery center, backup export, smoke status, sync lens
- agent loops
- alert hooks
- overview composition and summary reads
- Electron packaging and release tooling

### Legacy-only now

- `legacy/server.py` remains available for offline/admin investigation
- legacy parity or offline comparison flows can call it explicitly, but the app runtime does not

## Target backend structure

`apps/api-ts/src`

```text
app/
  create-server.ts         # Fastify bootstrap and shared cache wiring
  routes/
    platform.ts            # meta, recovery, ops, overview, execution graph
    providers.ts           # provider matrix, sessions, transcripts, search
    threads.ts             # threads, cleanup, forensics, thread transcript
domains/
  providers/
    transcript.ts          # transcript parsing and transcript payloads
    search.ts              # provider session scans, parser health, search read model
    actions.ts             # provider session backup/archive/delete
  threads/                 # Codex thread list, pin, archive, rename, cleanup
  recovery/
    roadmap.ts             # roadmap status and checkin append
                            # recovery center, backup export, smoke, sync remain here for now
  ops/                     # observatory, agent loops, alert hooks, runtime health
lib/
  constants.ts             # shared config and filesystem roots
  providers.ts             # provider ids, root rules, matrix, safe-path helpers
  recovery.ts              # remaining recovery aggregate module
  utils.ts                 # pure helpers only
```

## Rules

1. `app/create-server.ts` must stay focused on bootstrap, cache wiring, and route registration only.
2. Any remaining Python dependency must stay outside product/runtime wiring.
3. New TS business logic goes into a domain module, not `app/create-server.ts`.
4. `app/routes/*` owns HTTP registration; `lib/` stays for pure helpers and constants, not route logic.
5. Route handlers should call domain services or legacy adapters, never mix both
   inline when avoidable.

## Migration strategy

### Phase 1: isolate the boundary

- move Python proxy/cache helpers out of `app/create-server.ts`
- document every Python-backed endpoint
- stop adding new Python calls to product/runtime routes

### Phase 2: migrate by domain

- completed for runtime/product routes
- remaining work is retirement and deletion of legacy Python code

### Phase 3: retire legacy Python code

- delete unused legacy proxy helpers
- remove legacy backend env/config names from shared constants
- retire `legacy/server.py` or keep it only as an offline admin tool

## Why not full rewrite at once

The migration was done slice by slice because cleanup/state mutation paths were
the highest-risk area. That boundary is now explicit and TS-native at runtime,
so the remaining work is legacy retirement rather than product migration.
