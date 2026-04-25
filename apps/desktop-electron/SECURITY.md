# ThreadLens Desktop Security Notes

## Privilege boundary

- The renderer runs with `contextIsolation: true`.
- `nodeIntegration` stays disabled.
- External windows are denied and opened through the OS shell instead.
- The preload bridge only exposes:
  - `getApiBaseUrl`
  - `getApiAuthToken`
  - `revealPath`
  - `openPath`
  - `previewPath`
  - `pickDirectory`
  - `openWorkbenchWindow`
- Packaged desktop launches the local API with a per-run `THREADLENS_API_TOKEN`.
- Renderer requests include that token for local mutation endpoints.

## IPC validation

- `threadlens:file-action` only accepts `reveal`, `open`, or `preview`.
- `threadlens:file-action` requires a non-empty string `filePath` and preserves the original path bytes.
- `threadlens:open-window` normalizes `view`, `provider`, `filePath`, and `threadId` to strings.
- `threadlens:get-api-auth-token` returns only the per-run desktop API token.

## Sandbox status

`sandbox` currently remains `false`.

Reason:
- the desktop shell already keeps the renderer isolated with a narrow preload bridge,
- packaged desktop flows are currently verified against the unsandboxed preload path,
- flipping `sandbox` without a dedicated compatibility pass would be a behavior change, not a documentation-only cleanup.

Next step:
- run a dedicated cross-platform preload compatibility pass,
- then decide whether `sandbox` can be enabled without breaking packaged launch, file actions, or workbench window routing.
