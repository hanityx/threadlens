# Support

Use this guide before opening a public issue.

## Quick self-check

Run these first:

```bash
pnpm oss:hygiene
pnpm release:preflight
```

If one of these fails, include the failing command output in your issue.

## Where to ask for what

### Bug reports

Open a GitHub bug issue when:
- the app crashes
- the Electron bundle fails to start
- `release:preflight` fails unexpectedly
- provider/session data is missing or clearly incorrect

Before filing:
- attach the relevant `.run/` report path if available
- include OS, Node, pnpm, and whether you used `pnpm public:export`

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

- First public push guide: [docs/FIRST_PUBLIC_PUSH.md](docs/FIRST_PUBLIC_PUSH.md)
- Release checklist: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
- Release notes draft: [docs/RELEASE_NOTES_0.1.0.md](docs/RELEASE_NOTES_0.1.0.md)

## Common commands

```bash
pnpm oss:hygiene
pnpm release:preflight
pnpm public:export
pnpm release:macos:sign
```
