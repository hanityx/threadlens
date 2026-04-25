import { pathToFileURL } from "node:url";
import { render } from "ink";
import type { AppBootstrapProps, ProviderScope, ViewKey } from "./config.js";
import { getMessages, resolveLocale } from "./i18n/index.js";
import { SUPPORTED_LOCALES } from "./i18n/types.js";
function buildHelpText(locale: AppBootstrapProps["locale"]) {
  const messages = getMessages(locale ?? "en");
  return `${messages.cli.helpTitle}

${messages.cli.usageLabel}
  threadlens-tui [--view search|sessions|cleanup] [--query <text>] [--provider all|codex|claude|gemini|copilot] [--filter <text>] [--results] [--locale ${SUPPORTED_LOCALES.join("|")}]

${messages.cli.examplesLabel}
  threadlens-tui
  threadlens-tui --query obsidian
  threadlens-tui --query obsidian --results
  threadlens-tui --view sessions --provider codex
  threadlens-tui --view cleanup --filter risk
  threadlens-tui --locale ko
`;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): AppBootstrapProps | null {
  const next: AppBootstrapProps = {
    locale: resolveLocale(argv, env),
  };
  const invalidViewMessage = getMessages(next.locale ?? "en").cli.invalidView;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      console.log(buildHelpText(next.locale));
      return null;
    }
    if (token === "--view") {
      const value = argv[index + 1] as ViewKey | undefined;
      if (value && ["search", "sessions", "cleanup"].includes(value)) {
        next.initialView = value;
        index += 1;
      } else {
        throw new Error(invalidViewMessage);
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
    if (token === "--locale") {
      index += 1;
      continue;
    }
    if (token === "--results") {
      next.initialSearchFocus = "results";
    }
  }

  return next;
}

export async function main(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  let bootstrap: AppBootstrapProps | null;
  try {
    bootstrap = parseArgs(argv, env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!bootstrap) {
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.error(getMessages(bootstrap.locale ?? "en").cli.ttyRequired);
    process.exit(1);
  }

  const { App } = await import("./App.js");
  render(<App {...bootstrap} />);
}

const isMainModule =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  void main();
}
