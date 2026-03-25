# Support

Use this guide before opening a public issue.

## Quick self-check

Run these first:

```bash
pnpm --filter @threadlens/api test
pnpm --filter @threadlens/api build
pnpm --filter @threadlens/web build
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
- attach the relevant `.run/` report path if available
- include OS, Node, pnpm, and whether you used `pnpm package:desktop:dir`

### Feature requests

Open a GitHub feature request when:
- you want a new provider workflow
- you want dashboard/forensics/release UX changes
- you want packaging or public-release improvements

### Security reports

Do **not** open a public issue for vulnerabilities.

Use:
- [SECURITY.md](SECURITY.md)
- GitHub private vulnerability reporting

## Public release helpers

- Public architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Common commands

```bash
pnpm --filter @threadlens/api test
pnpm --filter @threadlens/api build
pnpm --filter @threadlens/web build
pnpm package:desktop:dir
```
