# Adding a Provider

ThreadLens provider support is intentionally local-first. A provider can expose
session discovery, transcript parsing, search, diagnostics, archive, backup, and
delete behavior, so new providers need both capability metadata and path-safety
coverage.

This guide describes the current internal extension path. It is not an external
plugin API, and new provider code should stay in reviewed source until a separate
security model exists.

## 1. Add Provider Metadata

Update `packages/shared-contracts/src/index.ts`.

Add the provider to `PROVIDER_REGISTRY` with:

- `id`
- `label`
- `docs_visibility`
- `search_scope_visibility`
- `provider_tab_group`
- `thread_review`
- `read_sessions`
- `read_transcript`
- `analyze_context`
- `safe_cleanup`
- `hard_delete`

`docs/PROVIDER_SUPPORT.md` is generated. Do not edit it by hand. The capability
table comes from the shared contracts registry, while provider-specific workflow
notes are maintained by the generator. After changing provider metadata or
generator notes, run:

```sh
pnpm docs:provider-support
```

## 2. Add Local Roots

Provider roots define where ThreadLens is allowed to read provider files from.
Update the provider adapter/root definitions in
`apps/api-ts/src/domains/providers/`.

Add roots for:

- live session files
- archived session files, if supported
- provider action backups, if supported
- provider-specific cache locations, if needed

Path safety must fail closed. Unknown provider ids must not fall through to
another provider's roots.

The current first step toward cleaner extension is the internal adapter registry.
Adapters identify the provider and expose root discovery. Keep this boundary
small at first:

```ts
export type ProviderAdapter = {
  id: ProviderId;
  label: string;
  roots(): ProviderRootSpec[];
  scanRoots?(): Promise<ProviderRootSpec[]>;
};
```

Do not duplicate capabilities in adapters. Capabilities must remain sourced from
`getProviderCapability(adapter.id)`.

Providers that do not store sessions as standalone files should use a session
locator model in later PRs instead of encoding provider-specific ids into fake
file paths:

```ts
export type ProviderSessionLocator =
  | { kind: "file"; file_path: string }
  | { kind: "sqlite"; db_path: string; session_id: string };
```

## 3. Add Search and Transcript Support

Most providers can use the existing JSON/JSONL transcript flow. In the current
code, custom storage shapes still touch these areas:

- `apps/api-ts/src/domains/providers/search.ts`
- `apps/api-ts/src/domains/providers/transcript.ts`
- `apps/api-ts/src/domains/providers/probe.ts`

Add fixtures for the real local file shape. Do not infer a provider format from
docs alone; use sample session files.

The intended direction is to move provider-specific session discovery and
transcript building behind adapters over follow-up PRs. For database-backed
providers, start read-only:

- open the database in read-only mode
- use a busy timeout or retry path for live provider databases
- emit `ProviderSessionRow` values from provider session records
- build `TranscriptPayload` from provider message/part records
- keep destructive actions disabled until backup/delete semantics are designed

## 4. Add Provider Diagnostics

Update `apps/api-ts/src/domains/providers/matrix.ts` so the provider appears in
the provider health matrix with useful evidence.

The matrix should show:

- whether roots were detected
- whether session files were found
- whether safe cleanup and hard delete are actually available
- the roots or evidence used for that decision

## 5. Add Archive, Backup, and Delete Behavior

If the provider supports destructive file actions, update
`apps/api-ts/src/domains/providers/actions.ts`.

Destructive actions must keep the existing safety rules:

- dry-run before apply
- confirm token before apply
- path-safety resolution before file mutation
- backup behavior must not be weakened

If the provider should be read-only, set `safe_cleanup: false` and
`hard_delete: false`.

## 6. Add Tests

At minimum, cover:

- provider id parsing and listing
- provider root specs
- path-safety allow/reject behavior
- transcript parsing from fixture files
- search result extraction
- matrix capability output
- archive/delete behavior if supported

Useful existing tests:

- `apps/api-ts/src/domains/providers/path-safety.test.ts`
- `apps/api-ts/src/domains/providers/parser-fixtures.test.ts`
- `apps/api-ts/src/domains/providers/search.test.ts`
- `apps/api-ts/src/domains/providers/transcript.test.ts`
- `apps/api-ts/src/domains/providers/matrix.test.ts`
- `apps/api-ts/src/domains/providers/actions.test.ts`

## Adapter Direction

The current code still has provider behavior spread across registry, path
safety, search, transcript, matrix, and actions. The intended direction is an
internal provider adapter registry, not an external plugin system.

The adapter boundary starts with provider identity and root discovery. Later PRs
can move provider-specific behavior behind that boundary, such as:

- health evidence
- session discovery
- transcript parsing
- provider-specific archive or restore targets

Capabilities should remain in `packages/shared-contracts/src/index.ts`; adapter
code should read them through `getProviderCapability(adapter.id)` instead of
storing a second copy.

Do not add dynamic loading of third-party provider code. ThreadLens reads and can
mutate local AI session files, so provider support should stay in reviewed source
code unless a separate security model is designed.

## Checklist

Before opening a provider PR:

```sh
pnpm docs:provider-support
pnpm --filter @threadlens/shared-contracts test
pnpm --filter @threadlens/api test
```

If provider UI copy changes are included, also run the relevant web or TUI tests.
