import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CODEX_GLOBAL_STATE_FILE } from "../../lib/constants.js";
import { cleanTitleText, readJsonFile } from "../../lib/utils.js";

export type CodexUiState = {
  titles: Record<string, string>;
  order: string[];
  pinned: string[];
  archived: string[];
  workspaces: string[];
  active: string[];
  labels: Record<string, string>;
};

type RawCodexUiState = Record<string, unknown>;

function defaultUiState(): CodexUiState {
  return {
    titles: {},
    order: [],
    pinned: [],
    archived: [],
    workspaces: [],
    active: [],
    labels: {},
  };
}

export async function loadCodexUiState(
  stateFilePath = CODEX_GLOBAL_STATE_FILE,
): Promise<CodexUiState> {
  const state = await readJsonFile(stateFilePath);
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return defaultUiState();
  }
  const record = state as Record<string, unknown>;
  const threadTitlesBlob =
    record["thread-titles"] &&
    typeof record["thread-titles"] === "object" &&
    !Array.isArray(record["thread-titles"])
      ? (record["thread-titles"] as Record<string, unknown>)
      : {};
  const titles =
    threadTitlesBlob.titles &&
    typeof threadTitlesBlob.titles === "object" &&
    !Array.isArray(threadTitlesBlob.titles)
      ? Object.fromEntries(
          Object.entries(threadTitlesBlob.titles as Record<string, unknown>).map(
            ([key, value]) => [key, String(value ?? "").trim()],
          ),
        )
      : {};
  const order = Array.isArray(threadTitlesBlob.order)
    ? threadTitlesBlob.order.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const pinned = Array.isArray(record["pinned-thread-ids"])
    ? record["pinned-thread-ids"].map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const archived = Array.isArray(record["archived-thread-ids"])
    ? record["archived-thread-ids"]
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    : [];
  const workspaces = Array.isArray(record["electron-saved-workspace-roots"])
    ? record["electron-saved-workspace-roots"]
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    : [];
  const active = Array.isArray(record["active-workspace-roots"])
    ? record["active-workspace-roots"]
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    : [];
  const labels =
    record["electron-workspace-root-labels"] &&
    typeof record["electron-workspace-root-labels"] === "object" &&
    !Array.isArray(record["electron-workspace-root-labels"])
      ? Object.fromEntries(
          Object.entries(
            record["electron-workspace-root-labels"] as Record<string, unknown>,
          ).map(([key, value]) => [key, String(value ?? "").trim()]),
        )
      : {};
  return {
    titles,
    order,
    pinned,
    archived,
    workspaces,
    active,
    labels,
  };
}

export async function readRawCodexUiState(
  stateFilePath = CODEX_GLOBAL_STATE_FILE,
): Promise<RawCodexUiState> {
  const raw = await readJsonFile(stateFilePath);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return { ...(raw as Record<string, unknown>) };
}

export async function renameThreadTitleTs(
  threadId: string,
  newTitle: string,
  options?: { stateFilePath?: string },
): Promise<{ ok: boolean; thread_id?: string; title?: string; path?: string; error?: string }> {
  const tid = String(threadId || "").trim();
  const title = cleanTitleText(newTitle || "", 140);
  if (!tid) {
    return { ok: false, error: "thread id is empty" };
  }
  if (!title) {
    return { ok: false, error: "new title is empty after cleaning" };
  }

  const stateFilePath = options?.stateFilePath ?? CODEX_GLOBAL_STATE_FILE;
  const state = await readRawCodexUiState(stateFilePath);
  const blob =
    state["thread-titles"] &&
    typeof state["thread-titles"] === "object" &&
    !Array.isArray(state["thread-titles"])
      ? { ...(state["thread-titles"] as Record<string, unknown>) }
      : {};
  const titles =
    blob.titles && typeof blob.titles === "object" && !Array.isArray(blob.titles)
      ? { ...(blob.titles as Record<string, unknown>) }
      : {};
  titles[tid] = title;
  blob.titles = titles;
  if (!Array.isArray(blob.order)) {
    blob.order = [];
  }
  state["thread-titles"] = blob;

  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8");

  return {
    ok: true,
    thread_id: tid,
    title,
    path: stateFilePath,
  };
}

export async function cleanGlobalStateRefsTs(
  threadIds: string[],
  options?: { dryRun?: boolean; stateFilePath?: string },
): Promise<{
  changed: boolean;
  removed: { titles: number; order: number; pinned: number };
  path: string;
  before_size: number;
  after_size: number;
}> {
  const ids = new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean));
  const stateFilePath = options?.stateFilePath ?? CODEX_GLOBAL_STATE_FILE;
  const state = await readRawCodexUiState(stateFilePath);
  const before = JSON.stringify(state);
  let changed = false;
  const removed = { titles: 0, order: 0, pinned: 0 };

  const blob =
    state["thread-titles"] &&
    typeof state["thread-titles"] === "object" &&
    !Array.isArray(state["thread-titles"])
      ? { ...(state["thread-titles"] as Record<string, unknown>) }
      : {};

  const titles =
    blob.titles && typeof blob.titles === "object" && !Array.isArray(blob.titles)
      ? { ...(blob.titles as Record<string, unknown>) }
      : {};
  for (const key of Object.keys(titles)) {
    if (!ids.has(key)) continue;
    delete titles[key];
    removed.titles += 1;
    changed = true;
  }
  blob.titles = titles;

  const order = Array.isArray(blob.order)
    ? blob.order.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const newOrder = order.filter((item) => !ids.has(item));
  removed.order = order.length - newOrder.length;
  if (removed.order > 0) changed = true;
  blob.order = newOrder;
  state["thread-titles"] = blob;

  const pinned = Array.isArray(state["pinned-thread-ids"])
    ? state["pinned-thread-ids"].map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const newPinned = pinned.filter((item) => !ids.has(item));
  removed.pinned = pinned.length - newPinned.length;
  if (removed.pinned > 0) changed = true;
  state["pinned-thread-ids"] = newPinned;

  const after = JSON.stringify(state);
  if (changed && !options?.dryRun) {
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8");
  }

  return {
    changed,
    removed,
    path: stateFilePath,
    before_size: before.length,
    after_size: after.length,
  };
}

export async function setThreadPinnedTs(
  threadIds: string[],
  pinned: boolean,
  options?: { stateFilePath?: string },
): Promise<{
  ok: boolean;
  pinned?: boolean;
  requested_ids?: string[];
  total_pinned?: number;
  path?: string;
  error?: string;
}> {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (ids.length === 0) {
    return { ok: false, error: "no thread ids provided" };
  }
  const stateFilePath = options?.stateFilePath ?? CODEX_GLOBAL_STATE_FILE;
  const state = await readRawCodexUiState(stateFilePath);
  const before = Array.isArray(state["pinned-thread-ids"])
    ? state["pinned-thread-ids"].map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  const out = pinned
    ? Array.from(new Set([...before, ...ids]))
    : before.filter((item) => !new Set(ids).has(item));

  state["pinned-thread-ids"] = out;
  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8");

  return {
    ok: true,
    pinned,
    requested_ids: ids,
    total_pinned: out.length,
    path: stateFilePath,
  };
}

export async function archiveThreadsLocalTs(
  threadIds: string[],
  options?: { stateFilePath?: string },
): Promise<{
  ok: boolean;
  mode?: string;
  requested_ids?: string[];
  state_result?: Awaited<ReturnType<typeof cleanGlobalStateRefsTs>>;
  error?: string;
}> {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (ids.length === 0) {
    return { ok: false, error: "no thread ids provided" };
  }
  const state_result = await cleanGlobalStateRefsTs(ids, {
    dryRun: false,
    stateFilePath: options?.stateFilePath,
  });
  const stateFilePath = options?.stateFilePath ?? CODEX_GLOBAL_STATE_FILE;
  const state = await readRawCodexUiState(stateFilePath);
  const archivedBefore = Array.isArray(state["archived-thread-ids"])
    ? state["archived-thread-ids"].map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  state["archived-thread-ids"] = Array.from(new Set([...archivedBefore, ...ids]));
  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8");
  return {
    ok: true,
    mode: "local-hide",
    requested_ids: ids,
    state_result,
  };
}

export function getThreadResumeCommandsTs(threadIds: string[]): {
  ok: boolean;
  count?: number;
  commands?: string[];
  text?: string;
  error?: string;
} {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (ids.length === 0) {
    return { ok: false, error: "no thread ids provided" };
  }
  const commands = ids.map((threadId) => `codex resume ${threadId}`);
  return {
    ok: true,
    count: commands.length,
    commands,
    text: commands.join("\n"),
  };
}
