# Provider Support

ThreadLens reads local conversation data from multiple provider-specific stores.
Support is split between `session workflows` and `thread cleanup`.

## Capability Summary

| Provider | Search and transcript read | Session backup / archive / delete | Dedicated thread cleanup |
| --- | --- | --- | --- |
| Codex | Yes | Yes | Yes |
| ChatGPT Desktop cache | Yes, when local cache is detected | No, read-only by policy | No |
| Claude CLI | Yes | Yes, when local session data is detected | No |
| Gemini CLI | Yes | Yes, when local session data is detected | No |
| Copilot Chat | Yes | Yes, when local session data is detected | No |

## Provider Notes

### Codex

- Central thread model with pinned state, archives, and cleanup review
- `Cleanup` is the main Codex workflow
- Session transcripts also appear in `Sessions`

### ChatGPT Desktop Cache

- Read-first integration for local desktop cache artifacts
- Search and transcript inspection are supported
- Destructive actions are disabled by policy

### Claude CLI

- Session-file oriented workflow
- Best used through `Search` and `Sessions`
- File-level archive and delete actions follow dry-run and confirm-token rules

### Gemini CLI

- Session data may live across multiple local stores
- Search and session inspection are supported
- File-level archive and delete actions depend on detected local data

### Copilot Chat

- Reads local chat artifacts from supported local stores
- Useful for search, transcript inspection, and session-file workflows
- It does not use the dedicated Codex cleanup path

## Workflow Guide

- Use `Search` when you do not know which provider owns the conversation yet.
- Use `Sessions` for provider file inspection and session-file actions.
- Use `Cleanup` only for Codex thread review and execution.

## TUI Note

The terminal workbench focuses on the core CLI provider set used in `Search`,
`Sessions`, and `Cleanup`. The broader provider matrix remains available in the
web workbench.
