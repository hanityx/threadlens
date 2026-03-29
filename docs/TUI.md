# ThreadLens TUI

ThreadLens ships a keyboard-first terminal workbench for `Search`, `Sessions`, and `Cleanup`.

## Start

```bash
pnpm dev:api
pnpm dev:tui

pnpm start:tui
```

The TUI expects the local API at `http://127.0.0.1:8788` by default.

## CLI Examples

```bash
pnpm start:tui -- --query obsidian
pnpm start:tui -- --query obsidian --results
pnpm start:tui -- --view sessions --provider codex
pnpm start:tui -- --view cleanup --filter risk
```

## Views

### Search

- Search raw conversation text across Codex, Claude, Gemini, and Copilot
- Group repeated hits by session
- Open the matching session
- Jump into cleanup when a Codex thread match exists

The TUI follows the shared searchable-provider contract. ChatGPT desktop cache
stays in the web session and diagnostics surfaces.

### Sessions

- Browse provider session rows
- Open transcript previews
- Run backup, archive, and delete flows
- Use dry-run and confirm-token execution for destructive actions

### Cleanup

- Browse Codex thread rows
- Select multiple threads
- Run impact analysis
- Run a cleanup dry-run
- Execute only after a confirm token is issued

## Keymap Highlights

- `1 / 2 / 3`: Search / Sessions / Cleanup
- `?`: help overlay
- `q`: quit
- Search: `Esc`, `Enter`, `Ctrl+N`, `Tab`, `Ctrl+O`
- Sessions: `b`, `a`, `A`, `d`, `D`
- Cleanup: `space`, `a`, `d`, `D`, `x`

## Terminal Requirement

The TUI must run in a real TTY terminal such as Terminal, iTerm, or tmux.
