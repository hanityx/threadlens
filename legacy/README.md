# Legacy Python Runtime

`legacy/server.py` is no longer part of the product runtime.

Use it only for:

- offline parity comparison
- legacy admin forensics
- migration reference while deleting old behavior

Current product/runtime API is TypeScript-only:

- `apps/api-ts/src/app/create-server.ts`
- Electron bundles the TS runtime directly

Do not wire new product features into `legacy/server.py`.
