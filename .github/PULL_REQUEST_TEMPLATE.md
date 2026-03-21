## What

Brief description of the change.

## Why

Context — what problem does this solve?

## How

Key implementation details or approach taken.

## Checklist

- [ ] `pnpm --filter @provider-surface/api build` passes
- [ ] `pnpm --filter @provider-surface/api test` passes
- [ ] `pnpm --filter @provider-surface/web build` passes
- [ ] `pnpm oss:hygiene` passes
- [ ] `pnpm release:preflight` passes or the reason it was skipped is explained
- [ ] No hardcoded absolute paths
- [ ] User-facing strings are in English
