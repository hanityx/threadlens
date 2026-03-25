import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import type { AppBootstrapProps, ProviderScope, ViewKey } from "./config.js";

const HELP_TEXT = `ThreadLens TUI

Usage:
  threadlens-tui [--view search|sessions|cleanup] [--query <text>] [--provider all|codex|claude|gemini|copilot] [--filter <text>] [--results]

Examples:
  threadlens-tui
  threadlens-tui --query obsidian
  threadlens-tui --query obsidian --results
  threadlens-tui --view sessions --provider codex
  threadlens-tui --view cleanup --filter risk
`;

function parseArgs(argv: string[]): AppBootstrapProps | null {
  const next: AppBootstrapProps = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      console.log(HELP_TEXT);
      return null;
    }
    if (token === "--view") {
      const value = argv[index + 1] as ViewKey | undefined;
      if (value && ["search", "sessions", "cleanup"].includes(value)) {
        next.initialView = value;
        index += 1;
      }
      continue;
    }
    if (token === "--query") {
      const value = argv[index + 1];
      if (value) {
        next.initialQuery = value;
        index += 1;
      }
      continue;
    }
    if (token === "--provider") {
      const value = argv[index + 1] as ProviderScope | undefined;
      if (value && ["all", "codex", "claude", "gemini", "copilot"].includes(value)) {
        next.initialProvider = value;
        index += 1;
      }
      continue;
    }
    if (token === "--filter") {
      const value = argv[index + 1];
      if (value) {
        next.initialFilter = value;
        index += 1;
      }
      continue;
    }
    if (token === "--results") {
      next.initialSearchFocus = "results";
    }
  }

  return next;
}

const bootstrap = parseArgs(process.argv.slice(2));

if (!bootstrap) {
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("ThreadLens TUI must run in a TTY terminal. Re-run it in Terminal, iTerm, or tmux.");
  process.exit(1);
}

render(<App {...bootstrap} />);
