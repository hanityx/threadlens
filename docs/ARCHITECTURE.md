# ThreadLens Architecture

ThreadLens serves all product traffic through a TypeScript-first runtime.
The Fastify API is the only active backend and is shared by the web app, TUI,
and desktop shell.

## Product runtime

- `apps/tui`
  - Ink terminal workbench for search, sessions, and cleanup
  - Calls the same TS API runtime used by the web and desktop shell
- `apps/web`
  - React UI for search, cleanup, sessions, and diagnostics
- `apps/api-ts`
  - Fastify API
  - Owns all product/runtime domains
  - Unknown `/api/*` paths return `404`
- `apps/desktop-electron`
  - Desktop shell, local API bootstrap, packaging

## Active backend split

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

## Backend layout

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
  recovery.ts              # recovery aggregate module
  utils.ts                 # pure helpers only
```

## Rules

1. `app/create-server.ts` must stay focused on bootstrap, cache wiring, and route registration only.
2. Product/runtime wiring must remain TypeScript-only.
3. New TS business logic goes into a domain module, not `app/create-server.ts`.
4. `app/routes/*` owns HTTP registration; `lib/` stays for pure helpers and constants, not route logic.
5. Route handlers should call domain services or focused adapters, never mix both
   inline when avoidable.
6. Terminal workflows should reuse the same TS API contracts first; do not fork
   TUI-only business rules unless latency or offline constraints require it.

## Notes

- Conversation Search, Source Sessions, Cleanup, and Diagnostics all read from
  the same local runtime.
- Web stays on React 18 while the Ink TUI tracks React 19 on its own runtime.
- Sync Lens is an optional read-only remote comparison path and requires an
  explicit `SYNC_LENS_REMOTE_ALIAS` plus `python3` on the remote host.
- Desktop packaging wraps the same web + API stack rather than maintaining a
  separate desktop-only backend.
- Older historical backend notes belong in local-only docs, not in the public product
  architecture surface.
