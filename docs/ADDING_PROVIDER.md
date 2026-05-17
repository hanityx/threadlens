# Adding a Provider

ThreadLens provider support is intentionally local-first. A provider can expose
session discovery, transcript parsing, search, diagnostics, archive, backup, and
delete behavior, so new providers need both capability metadata and path-safety
coverage.

This guide describes the current in-repo extension path. It is not an external
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
Update the explicit api-ts provider registry and the provider-specific adapter
folder under `apps/api-ts/src/domains/providers/`.

Touch these files deliberately:

- `packages/shared-contracts/src/index.ts` for the shared provider capability
  source of truth
- `apps/api-ts/src/domains/providers/registry.ts` for the explicit implemented
  adapter registration
- `apps/api-ts/src/domains/providers/capabilities.ts` for route/search/report
  exposure policy
- `apps/api-ts/src/domains/providers/shared/file-roots.ts` for canonical file
  root specs and scan root specs
- `apps/api-ts/src/domains/providers/adapters/<provider>/` for provider-specific
  root discovery, title, transcript, or health evidence when real
  provider-specific behavior exists
- `apps/api-ts/src/domains/providers/shared/` only for provider-neutral path/root
  helpers

Add or validate roots for:

- live session files
- archived session files, if supported
- provider action backups, if supported
- provider-specific cache locations, if needed

Path safety must fail closed. Unknown provider ids must not fall through to
another provider's roots. `ProviderRootSpec.source` is used in backup-relative
paths, so it must be deterministic and validation-safe. Do not derive `source`
from arbitrary local directory names.

Adapters identify the provider and expose root discovery. Keep this boundary
small:

```ts
export type ProviderAdapter = {
  id: ProviderId;
  label: string;
  roots(): ProviderRootSpec[];
  scanRoots?(): Promise<ProviderRootSpec[]>;
  scanSessions?(): Promise<ProviderSessionCandidate[] | ProviderSessionRow[]>;
  health?(): Promise<ProviderHealthEvidence>;
};
```

Do not duplicate capabilities in adapters. Capabilities must remain sourced from
`getProviderCapability(adapter.id)`.

Do not create empty `adapters/<provider>/transcript.ts`, `title.ts`, or
`health.ts` files just to match a template. Optional adapter modules should
exist only when they hold real provider-specific behavior.

Providers that do not store sessions as standalone files should use a session
locator model instead of encoding provider-specific ids into fake file paths:

```ts
export type ProviderSessionLocator =
  | { kind: "file"; file_path: string }
  | { kind: "sqlite"; db_path: string; session_id: string };
```

The locator type exists in the registry, but full DB-backed product support
also needs transcript routing and UI selection keys that do not collapse
multiple sessions sharing one backing database file.

## 3. Add Search and Transcript Support

Most providers can use the existing JSON/JSONL transcript flow. Provider-neutral
engines live under `apps/api-ts/src/domains/providers/services/`; provider-specific
logic belongs under `apps/api-ts/src/domains/providers/adapters/<provider>/`.

Do not add a new provider by hardcoding it into search or matrix entry points.
The default search/report/matrix surfaces should flow through
`capabilities.ts` and the explicit adapter registry. If a provider needs a
custom scan budget, add that weight in the search service only after the
provider is registered and tested.

Add fixtures for the real local file shape. Do not infer a provider format from
docs alone; use sample session files.

For database-backed providers, start read-only:

- open the database in read-only mode
- use a busy timeout or retry path for live provider databases
- emit `ProviderSessionRow` values from provider session records
- build `TranscriptPayload` from provider message/part records
- keep destructive actions disabled until backup/delete semantics are designed

## 4. Add Provider Diagnostics

Update the provider adapter/health evidence so the provider appears in the
provider health matrix with useful evidence. Matrix rows should stay aligned
with the explicit adapter registry and capability helpers.

The matrix should show:

- whether roots were detected
- whether session files were found
- whether safe cleanup and hard delete are actually available
- the roots or evidence used for that decision

## 5. Add Archive, Backup, and Delete Behavior

If the provider supports destructive file actions, update the provider action
service under `apps/api-ts/src/domains/providers/services/actions/` only when
the action is truly cross-provider. Provider-specific root/target differences
belong in `adapters/<provider>/` or `shared/` helpers.

Destructive actions must keep the existing safety rules:

- dry-run before apply
- confirm token before apply
- path-safety resolution before file mutation
- backup behavior must not be weakened

If the provider should be read-only, set `safe_cleanup: false` and
`hard_delete: false`. Read-only providers are excluded from provider session
actions, including `backup_local`.

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

- `apps/api-ts/src/domains/providers/provider-extension-contract.test.ts`
- `apps/api-ts/src/domains/providers/path-safety.test.ts`
- `apps/api-ts/src/domains/providers/parser-fixtures.test.ts`
- `apps/api-ts/src/domains/providers/services/search/session-search.test.ts`
- `apps/api-ts/src/domains/providers/services/search/session-hit-search.test.ts`
- `apps/api-ts/src/domains/providers/search-policy.test.ts`
- `apps/api-ts/src/domains/providers/transcript.test.ts`
- `apps/api-ts/src/domains/providers/matrix.test.ts`
- `apps/api-ts/src/domains/providers/actions.test.ts`
- `apps/api-ts/src/domains/providers/adapters.test.ts`

## Adapter Direction

The provider boundary is an in-repo provider adapter registry, not an external
plugin system.

The adapter boundary starts with provider identity and root discovery. Keep
provider-specific behavior behind that boundary when possible, such as:

- health evidence
- session discovery
- transcript parsing
- provider-specific archive or restore targets

Capabilities should remain in `packages/shared-contracts/src/index.ts`; adapter
code should read them through `getProviderCapability(adapter.id)` instead of
storing a second copy.

`capabilities.ts` in api-ts is not a second capability source of truth. It is
the policy layer that intersects shared-contract facts with api-ts implemented
adapters and route exposure rules.

Do not add dynamic loading of third-party provider code. ThreadLens reads and can
mutate local AI session files, so provider support should stay in reviewed source
code unless a separate security model is designed.

## Checklist

Before opening a provider PR:

```sh
pnpm qa:provider
```

If provider UI copy changes are included, also run the relevant web or TUI tests.
