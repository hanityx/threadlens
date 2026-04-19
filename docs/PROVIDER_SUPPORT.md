# Provider Support

_Generated from `packages/shared-contracts/src/index.ts`. Do not hand-edit this file; run `pnpm docs:provider-support`._

ThreadLens reads local conversation data from multiple provider-specific stores.
Support is split between `public workflow surfaces` and `internal read-only stores`.

The public search/session workflow currently covers `Codex`, `Claude`, `Gemini`, `Copilot`.
`ChatGPT` is currently treated as an internal read-only desktop cache source and is excluded from the default public search scope and destructive cleanup workflow.

## Capability Registry

| Provider | Docs | Search scope | Sessions | Transcript | Analyze | Safe cleanup | Hard delete | Thread review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codex | public | public | Yes | Yes | Yes | Yes | Yes | Yes |
| ChatGPT | internal | internal | Yes | No | Yes | No | No | No |
| Claude | public | public | Yes | Yes | Yes | Yes | Yes | No |
| Gemini | public | public | Yes | Yes | Yes | Yes | Yes | No |
| Copilot | public | public | Yes | Yes | Yes | Yes | Yes | No |

## Workflow Summary

| Provider | Search / transcript workflow | Session archive / delete workflow | Dedicated thread review |
| --- | --- | --- | --- |
| Codex | Public workflow + transcript read | Yes | Yes |
| ChatGPT | Internal only | Read-only | No |
| Claude | Public workflow + transcript read | Yes | No |
| Gemini | Public workflow + transcript read | Yes | No |
| Copilot | Public workflow + transcript read | Yes | No |

## Local Path Notes

- `Codex` reads session logs from `CODEX_HOME` plus detected Codex home mirrors such as `~/.codex` and `~/.codex-cli`; it is not tied to macOS app-data paths.
- `ChatGPT` reads the desktop cache from the local app-data path under `com.openai.chat`; this provider remains internal and read-only.
- `Claude` reads local session stores from dot-home roots such as `~/.claude`.
- `Gemini` reads local session stores from dot-home roots such as `~/.gemini`.
- `Copilot` resolves local app-data roots by platform: macOS `~/Library/Application Support`, Windows `%APPDATA%`, and Linux `XDG_CONFIG_HOME` or `~/.config`.

## Provider Notes

### Codex

- Central thread model with pinned state, archives, and cleanup review.
- `Thread` is the main Codex workflow.
- Session transcripts also appear in `Sessions`.

### ChatGPT

- Internal read-only cache source.
- Useful for desktop cache discovery and provider diagnostics.
- Excluded from the default public search scope and destructive cleanup workflow.

### Claude

- Session-file oriented workflow.
- Best used through `Search` and `Sessions`.
- File-level archive and delete actions follow dry-run and confirm-token rules.

### Gemini

- Session data may live across multiple local stores.
- Search and session inspection are supported.
- File-level archive and delete actions depend on detected local data.

### Copilot

- Reads local chat artifacts from supported local stores.
- Useful for search, transcript inspection, and session-file workflows.
- It does not use the dedicated Codex cleanup path.


## Workflow Guide

- Use `Search` when you do not know which Codex, Claude, Gemini, Copilot session owns the conversation yet.
- Use `Sessions` for provider file inspection and session-file actions.
- Use `Thread` only for Codex thread review and execution.

## TUI Note

The terminal workbench follows the same core search scope used in the web workbench:
`Codex`, `Claude`, `Gemini`, `Copilot`.
