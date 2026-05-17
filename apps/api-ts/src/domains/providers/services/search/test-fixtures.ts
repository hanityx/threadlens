import type { ProviderSessionRow, TranscriptPayload } from "../../types.js";

export function makeRow(overrides: Partial<ProviderSessionRow> = {}): ProviderSessionRow {
  return {
    provider: "codex",
    source: "sessions",
    session_id: "rollout-2026-03-25T10-00-00-019d-search-test",
    display_title: "Search fixture",
    file_path: "/tmp/search-fixture.jsonl",
    size_bytes: 128,
    mtime: "2026-03-25T10:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Search fixture",
      title_source: "fixture",
    },
    ...overrides,
  };
}

export function makeTranscript(
  row: ProviderSessionRow,
  messages: TranscriptPayload["messages"],
): TranscriptPayload {
  return {
    provider: row.provider,
    thread_id: "019d-search-test-thread",
    file_path: row.file_path,
    scanned_lines: messages.length,
    message_count: messages.length,
    truncated: false,
    messages,
  };
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function waitForCondition(
  predicate: () => boolean,
  label: string,
  attempts = 100,
) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`timed out waiting for ${label}`);
}
