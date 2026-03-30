# Provider Support

ThreadLens reads local conversation data from multiple provider-specific stores.
Support is split between `session workflows` and the Codex `Thread` review surface.

The shared web search contract currently covers `Codex`, `Claude`, `Gemini`, and `Copilot`.

## Capability Summary

| Provider | Search scope / transcript read | Session backup / archive / delete | Dedicated thread review |
| --- | --- | --- | --- |
| Codex | Yes | Yes | Yes |
| Claude | Yes | Yes, when local session data is detected | No |
| Gemini | Yes | Yes, when local session data is detected | No |
| Copilot | Yes | Yes, when local session data is detected | No |

## Provider Notes

### Codex

- Central thread model with pinned state, archives, and cleanup review
- `Thread` is the main Codex workflow
- Session transcripts also appear in `Sessions`

### Claude

- Session-file oriented workflow
- Best used through `Search` and `Sessions`
- File-level archive and delete actions follow dry-run and confirm-token rules

### Gemini

- Session data may live across multiple local stores
- Search and session inspection are supported
- File-level archive and delete actions depend on detected local data

### Copilot

- Reads local chat artifacts from supported local stores
- Useful for search, transcript inspection, and session-file workflows
- It does not use the dedicated Codex cleanup path

## Workflow Guide

- Use `Search` when you do not know which Codex, Claude, Gemini, or Copilot session owns the conversation yet.
- Use `Sessions` for provider file inspection and session-file actions.
- Use `Thread` only for Codex thread review and execution.

## TUI Note

The terminal workbench follows the same core search scope used in the web workbench:
`Codex`, `Claude`, `Gemini`, and `Copilot`.
