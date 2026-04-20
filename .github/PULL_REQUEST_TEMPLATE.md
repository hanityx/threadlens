## What

Brief description of the change.

## Why

Context — what problem does this solve?

## How

Key implementation details or approach taken.

## Checklist

- [ ] `pnpm --filter @threadlens/api build` passes
- [ ] `pnpm --filter @threadlens/api test` passes
- [ ] `pnpm --filter @threadlens/web test` passes when the web workbench changes
- [ ] `pnpm --filter @threadlens/web build` passes when the web workbench changes
- [ ] `pnpm --filter @threadlens/tui test` and `pnpm --filter @threadlens/tui build` pass when the terminal workbench changes
- [ ] `pnpm --filter @threadlens/desktop-electron lint` and `pnpm --filter @threadlens/desktop-electron test` pass when the desktop shell changes
- [ ] `pnpm package:desktop:dir` and `pnpm --filter @threadlens/desktop-electron smoke:packaged` pass when packaged desktop behavior changes
- [ ] no unintended private files or local-only helpers are included
- [ ] `pnpm build` and the nearest relevant tests pass, or the reason they were skipped is explained
- [ ] No hardcoded absolute paths
- [ ] User-facing strings are in English
