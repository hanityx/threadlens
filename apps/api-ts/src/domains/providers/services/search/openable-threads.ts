import { OPENABLE_THREAD_IDS_CACHE_TTL_MS } from "./constants.js";

let openableThreadIdsCache:
  | {
      expires_at: number;
      ids: Set<string>;
    }
  | null = null;
let openableThreadIdsInflight: Promise<Set<string>> | null = null;

export async function resolveOpenableThreadIds(
  forceRefresh: boolean,
): Promise<Set<string>> {
  const now = Date.now();
  if (!forceRefresh && openableThreadIdsCache && openableThreadIdsCache.expires_at > now) {
    return new Set(openableThreadIdsCache.ids);
  }
  if (!forceRefresh && openableThreadIdsInflight) {
    return openableThreadIdsInflight.then((ids) => new Set(ids));
  }

  const loadIds = (async () => {
    const { getThreadsTs } = await import("../../../threads/query.js");
    const threads = await getThreadsTs({
      offset: "0",
      limit: "240",
      q: "",
      sort: "updated_desc",
      ...(forceRefresh ? { refresh: "1" } : {}),
    });
    const ids = new Set(
      (threads.rows ?? [])
        .map((row) => String(row.thread_id || "").trim())
        .filter(Boolean),
    );
    openableThreadIdsCache = {
      expires_at: Date.now() + OPENABLE_THREAD_IDS_CACHE_TTL_MS,
      ids,
    };
    return ids;
  })();

  if (!forceRefresh) {
    openableThreadIdsInflight = loadIds;
  }

  try {
    return new Set(await loadIds);
  } finally {
    if (openableThreadIdsInflight === loadIds) {
      openableThreadIdsInflight = null;
    }
  }
}
