# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Current |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Email the maintainers or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).
3. Include steps to reproduce and any relevant details.

We aim to respond within **72 hours** and will coordinate a fix before public disclosure.

## Scope

This project runs **locally** and does not expose endpoints to the internet by default. However, the following areas are security-relevant:

- **Token-verified cleanup flow**: All destructive operations (archive, delete) require a two-step dry-run + confirm-token handshake.
- **Provider file path validation**: File operations are guarded by provider-root and extension allowlists to prevent path traversal.
- **Python backend proxy**: The TS API proxies unknown `/api/*` routes to the Python backend on `127.0.0.1:8787`. Ensure this port is not exposed externally.
- **No authentication**: The API has no auth layer — it is designed for single-user local use only. Do not expose ports 8787/8788 to untrusted networks.

## Dependencies

We use `pnpm audit` to track known vulnerabilities in dependencies. Contributors are encouraged to run `pnpm audit` before submitting PRs.
