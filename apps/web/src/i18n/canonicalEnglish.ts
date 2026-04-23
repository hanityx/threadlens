import { en, type Messages } from "@/i18n/en";

const ENGLISH_MESSAGES = en;

export const CANONICAL_ENGLISH_PATHS = [
  "nav.overview",
  "nav.search",
  "nav.threads",
  "nav.providers",
  "nav.forensics",
  "nav.routing",
  "nav.light",
  "nav.dark",
  "hero.title",
  "setup.title",
  "overview.openSetup",
  "overview.closeSetup",
  "overview.openThreads",
  "overview.openSessions",
  "common.allAi",
  "common.ok",
  "common.fail",
  "search.allProviders",
  "overview.readyLabel",
  "overview.failLabel",
  "overview.commandPathSessions",
  "overview.commandPathActive",
  "providers.hubTitle",
  "providers.advancedTitle",
  "threadsTable.title",
  "threadsTable.heroTitle",
  "forensics.title",
  "forensics.stageReady",
  "forensics.stagePending",
  "threadDetail.title",
  "sessionDetail.title",
] as const;

function getByPath(value: Record<string, unknown>, path: string): string {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, value) as string;
}

function setByPath(value: Record<string, unknown>, path: string, nextValue: string) {
  const parts = path.split(".");
  const last = parts.pop();
  if (!last) return;
  const parent = parts.reduce<Record<string, unknown> | null>((acc, segment) => {
    if (!acc) return null;
    const next = acc[segment];
    return next && typeof next === "object" ? (next as Record<string, unknown>) : null;
  }, value);
  if (!parent) return;
  parent[last] = nextValue;
}

export function withCanonicalEnglish(messages: Messages): Messages {
  if (messages === ENGLISH_MESSAGES) return ENGLISH_MESSAGES;
  const next = JSON.parse(JSON.stringify(messages)) as Messages;
  for (const path of CANONICAL_ENGLISH_PATHS) {
    setByPath(next, path, getByPath(ENGLISH_MESSAGES, path));
  }
  return next;
}
