# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Current |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

1. **Do not** open a public GitHub issue.
2. Use GitHub private vulnerability reporting from the **Security** tab of this repository.
3. Include steps to reproduce and any relevant details.

We aim to respond to private reports within **72 hours**.

## Scope

This project runs **locally** and does not expose endpoints to the internet by default. However, the following areas are security-relevant:

- **Token-verified cleanup flow**: All destructive operations (archive, delete) require a two-step dry-run + confirm-token handshake.
- **Provider file path validation**: File operations are guarded by provider-root and extension allowlists to prevent path traversal.
- **TS-only runtime**: The product runtime is served by the local Fastify API on `127.0.0.1:8788`. Unknown `/api/*` paths now return `404`.
- **No authentication**: The API has no auth layer — it is designed for single-user local use only. Do not expose port `8788` to untrusted networks.

## Dependencies

We use `pnpm audit` to track known vulnerabilities in dependencies. Contributors are encouraged to run `pnpm audit` before submitting PRs.
