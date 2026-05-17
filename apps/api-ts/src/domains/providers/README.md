# Provider Extension Guide

This domain uses an in-repo, reviewed-source provider model. A provider is not
loaded dynamically at runtime; adding one is a small code change with explicit
registry, capability, and path-safety review.

## Ownership

- `adapters/`: provider-specific facts and optional probes.
- `services/`: cross-provider engines for search, actions, transcripts, and
  matrix data. Do not put provider-specific branches here unless the common
  engine needs a new extension point.
- `shared/file-roots.ts`: canonical provider root specs and scan root specs.
- `shared/`: other provider-domain helpers for backup roots and fail-closed
  path safety.
- `capabilities.ts`: API-facing policy for which implemented providers are
  searchable, transcript-readable, and cleanup-capable.
- `registry.ts`: adapter registration and the `ProviderAdapter` contract.

## Minimum Provider

For a file-backed provider, add:

1. `packages/shared-contracts/src/index.ts`
   - Add the provider to `PROVIDER_REGISTRY` with its label and capabilities.
2. `apps/api-ts/src/domains/providers/capabilities.ts`
   - Add the id to `IMPLEMENTED_PROVIDER_IDS`.
3. `apps/api-ts/src/domains/providers/registry.ts`
   - Register it in `PROVIDER_ADAPTERS`.
4. `apps/api-ts/src/domains/providers/shared/file-roots.ts`
   - Add root specs and scan root specs.
5. Provider tests or fixtures
   - Add the smallest fixture or unit test that proves sessions are discovered
     and parsed.

Optional provider-specific files live under `adapters/<provider>/` only when
they contain real provider-specific behavior, for example:

- `roots.ts`
- `title.ts`
- `health.ts`
- `transcript.ts`

Do not create empty pass-through files just to match a folder template.

This minimum path only proves file-backed session discovery. It does not prove
full product support for DB-backed providers such as SQLite session stores.

For a DB-backed provider, do not fake every session as the same database file
path. Add the missing product contract first:

- A stable session locator that includes the provider session id.
- A transcript reader for the provider's storage shape.
- API routing that can read transcripts by that locator.
- UI selection/detail keys that do not collapse multiple sessions sharing one
  backing database file.

Until those pieces exist, a DB-backed provider can be treated only as a scan
spike, not as a supported UI provider.

## Guardrails

- Keep provider-specific filesystem rules out of `services/`.
- Keep shared pure utilities in `src/lib`; provider-domain helpers belong in
  `domains/providers/shared`.
- All destructive actions must flow through `services/actions`.
- Do not add unsupported providers as hidden registry entries. If a
  provider is not supported, leave it out of the registry.
- Run `pnpm docs:provider-support` after changing capabilities.

## Verification

Run the nearest checks after adding a provider:

```bash
pnpm --filter @threadlens/shared-contracts test
pnpm --filter @threadlens/api test -- src/domains/providers/provider-extension-contract.test.ts
pnpm qa:provider
```

Use `provider-extension-contract.test.ts` as the first failure to read when a
new provider is only partially wired.
