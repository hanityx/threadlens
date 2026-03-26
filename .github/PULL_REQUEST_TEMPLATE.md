## What

Brief description of the change.

## Why

Context — what problem does this solve?

## How

Key implementation details or approach taken.

## Checklist

- [ ] `pnpm --filter @threadlens/api build` passes
- [ ] `pnpm --filter @threadlens/api test` passes
- [ ] `pnpm --filter @threadlens/web build` passes
- [ ] `pnpm check:public-markdown-hygiene` passes when tracked markdown changed
- [ ] no unintended private files or local-only helpers are included
- [ ] `pnpm build` and the nearest relevant tests pass, or the reason they were skipped is explained
- [ ] No hardcoded absolute paths
- [ ] User-facing strings are in English
