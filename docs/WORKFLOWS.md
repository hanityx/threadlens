# ThreadLens Workflows

ThreadLens is organized around a small set of workflows instead of a single flat dashboard.

## 1. Conversation Search

Use `Search` when you remember a phrase, filename, or session note but do not
yet know where it lives.

- Searches raw conversation text across the shared web search scope: Codex, Claude, Gemini, and Copilot
- Groups repeated hits by session
- Lets you jump into `Sessions`
- Lets you jump into `Thread` when a Codex thread match is available

Use this first when the question is "where did that conversation happen?"

## 2. Sessions

Use `Sessions` when you want to inspect provider session files directly.

- Browse provider session rows
- Open transcripts
- Review parser health and provider readiness
- Run provider session actions such as backup, archive, or delete

This is the source-session surface across providers.

## 3. Thread

Use `Thread` when you are reviewing Codex threads for archive or delete.

- Select thread rows
- Run impact analysis
- Run cleanup dry-runs
- Execute cleanup only after a confirm token is issued

This workflow is separate from provider session actions. It is the dedicated
thread-review surface.

## 4. Diagnostics

Use `Overview` and diagnostics panels when you need runtime and storage evidence.

- Runtime health and smoke status
- Setup can save one default AI so `Search` and `Sessions` reopen from the same provider starting point
- Recovery center and backup status
- Provider data-source inventory
- Parser health and execution graph

## Safe Sequence

The usual path is:

1. Search for the conversation or thread
2. Inspect the matching session or thread detail
3. Back up before destructive actions when needed
4. Run a dry-run
5. Review the confirm token and impact summary
6. Execute only after review

## Surface Map

- `Overview`: status, default-AI setup, and diagnostics entry point
- `Search`: cross-provider conversation lookup
- `Sessions`: provider session files and transcript actions
- `Thread`: Codex thread review and cleanup execution
- `TUI`: terminal-first `Search`, `Sessions`, and `Cleanup`
