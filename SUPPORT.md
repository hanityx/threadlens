# Support

Use this guide before opening a public issue.

## Quick self-check

Run these first:

```bash
pnpm --filter @threadlens/api test
pnpm --filter @threadlens/api build
pnpm --filter @threadlens/web test
pnpm --filter @threadlens/web build
pnpm --filter @threadlens/tui test
pnpm --filter @threadlens/tui build
```

If one of these fails, include the failing command output in your issue.

## Where to ask for what

### Bug reports

Open a GitHub bug issue when:
- the app crashes
- the Electron bundle fails to start
- the API or web build fails unexpectedly
- provider/session data is missing or clearly incorrect

Before filing:
- include the failing command output when possible
- include OS, Node, and pnpm versions
- say whether the issue happened in `Overview`, `Search`, `Thread`, `Sessions`, `TUI`, or packaged desktop mode
- if the issue is provider-specific, include the provider name and the action you were attempting

### Feature requests

Open a GitHub feature request when:
- you want a new provider workflow
- you want dashboard or cleanup UX changes
- you want packaging or release-surface improvements

### Security reports

Do **not** open a public issue for vulnerabilities.

Use:
- [SECURITY.md](SECURITY.md)
- GitHub private vulnerability reporting

## Public release helpers

- Public architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Workflow guide: [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- Provider guide: [docs/PROVIDER_SUPPORT.md](docs/PROVIDER_SUPPORT.md)
- TUI guide: [docs/TUI.md](docs/TUI.md)

## Common commands

```bash
pnpm --filter @threadlens/api test
pnpm --filter @threadlens/api build
pnpm --filter @threadlens/web test
pnpm --filter @threadlens/web build
pnpm --filter @threadlens/tui test
pnpm --filter @threadlens/tui build
pnpm package:desktop:dir
```
