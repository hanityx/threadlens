# Adding a Provider

ThreadLens provider support is an **in-repo, local-first adapter registry**. It
is not an external plugin API.

This guide is for **file-backed providers**: providers with stable local roots
and session files that ThreadLens can scan directly, such as JSON, JSONL, or
provider-specific files with a parser.

## Scope

These cases need separate product work before they are contributor-friendly:

- database-backed stores where many sessions share one database file
- cloud/API-only providers with no local session files
- external plugin loading
- destructive actions without clear backup/delete semantics

If a provider is database-backed, start it as a separate read-only feature slice.
Do not fake database session ids as file paths to fit the file-backed flow.

## Files to Touch

For a minimal file-backed provider, expect to update:

1. `packages/shared-contracts/src/index.ts`
   - Add provider metadata to `PROVIDER_REGISTRY`.
   - Capability fields include `read_sessions`, `read_transcript`,
     `analyze_context`, `safe_cleanup`, and `hard_delete`.
2. `apps/api-ts/src/domains/providers/capabilities.ts`
   - Add the provider to `IMPLEMENTED_PROVIDER_IDS` and exposure helpers.
3. `apps/api-ts/src/domains/providers/registry.ts`
   - Register the provider adapter in `PROVIDER_ADAPTERS`.
4. `apps/api-ts/src/domains/providers/shared/file-roots.ts`
   - Add canonical root specs and scan root specs.
5. `apps/api-ts/src/domains/providers/adapters/<provider>/`
   - Add only real provider-specific behavior, such as roots, title,
     transcript, or health evidence.
6. Fixtures and tests.

`docs/PROVIDER_SUPPORT.md` is generated. After capability or generator-note
changes, run:

```sh
pnpm docs:provider-support
```

## Adapter Contract

Adapters identify the provider and expose root/session/health discovery. Keep
the boundary small:

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

Rules:

- Capabilities stay in `packages/shared-contracts/src/index.ts`.
- Adapter code reads capabilities through `getProviderCapability(adapter.id)`.
- `apps/api-ts/src/domains/providers/capabilities.ts` is policy, not a second
  source of truth.
- Do not create empty `transcript.ts`, `title.ts`, or `health.ts` files just to
  match a template.
- Provider-specific code belongs in `adapters/<provider>/`.
- Cross-provider engines belong in `services/`.
- Provider-neutral path/root helpers belong in `shared/`.

## Safety and Product Behavior

Path safety must fail closed:

- unknown provider ids must not fall through to another provider's roots
- `ProviderRootSpec.source` must be deterministic and validation-safe
- do not derive `source` from arbitrary local directory names

Search, matrix, and reports should flow through `capabilities.ts` and the
explicit adapter registry. Do not hardcode new provider ids into entry points.

Use real fixture files for the provider's local shape. Do not infer a file format
from docs alone.

For destructive actions:

- start read-only unless backup/delete semantics are clear
- keep dry-run before apply
- require a confirm token before apply
- resolve path safety before file mutation
- do not weaken backup behavior

## Tests

At minimum, cover:

- provider id parsing and listing
- provider root specs
- path-safety allow/reject behavior
- transcript parsing from fixtures
- search result extraction
- matrix capability output
- archive/delete behavior, if supported

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

Before opening a provider PR:

```sh
pnpm qa:provider
```

If provider UI copy changes are included, also run the relevant web or TUI tests.
