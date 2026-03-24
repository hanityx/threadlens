import { describe, expect, it } from "vitest";
import type { ProviderSessionRow } from "../../types";
import {
  buildProviderSessionComputedIndex,
  buildSourceFilterOptions,
  filterProviderSessionRows,
  sortProviderSessionRows,
} from "./sessionTableModel";

const rows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "session-jsonl",
    display_title: "Alpha cleanup",
    file_path: "/tmp/alpha.jsonl",
    size_bytes: 300,
    mtime: "2026-03-24T02:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Alpha cleanup",
      title_source: "header",
    },
  },
  {
    provider: "claude",
    source: "workspace_chats",
    session_id: "session-json",
    display_title: "Bravo debug",
    file_path: "/tmp/bravo.json",
    size_bytes: 200,
    mtime: "2026-03-24T03:00:00.000Z",
    probe: {
      ok: false,
      format: "json",
      error: "broken",
      detected_title: "Bravo debug",
      title_source: "header",
    },
  },
  {
    provider: "codex",
    source: "",
    session_id: "session-metadata",
    display_title: "Zulu metadata",
    file_path: "/tmp/zulu.metadata.json",
    size_bytes: 100,
    mtime: "2026-03-24T04:00:00.000Z",
    probe: {
      ok: true,
      format: "json",
      error: null,
      detected_title: "Zulu metadata",
      title_source: "header",
    },
  },
];

describe("sessionTableModel", () => {
  it("builds sorted source filter options with unknown fallback", () => {
    expect(buildSourceFilterOptions(rows)).toEqual([
      { source: "history", count: 1 },
      { source: "unknown", count: 1 },
      { source: "workspace_chats", count: 1 },
    ]);
  });

  it("filters rows by source, probe state, search query, and slow-provider scope", () => {
    const index = buildProviderSessionComputedIndex(rows);
    const filtered = filterProviderSessionRows(rows, index, {
      query: "bravo",
      sourceFilter: "workspace_chats",
      probeFilter: "fail",
      effectiveSlowOnly: true,
      slowProviderSet: new Set<string>(["claude"]),
    });

    expect(filtered.map((row) => row.session_id)).toEqual(["session-json"]);
  });

  it("sorts with transcript priority before requested order", () => {
    const index = buildProviderSessionComputedIndex(rows);
    const sorted = sortProviderSessionRows(
      rows,
      index,
      new Intl.Collator(undefined, { sensitivity: "base" }),
      "mtime_desc",
    );

    expect(sorted.map((row) => row.session_id)).toEqual([
      "session-jsonl",
      "session-json",
      "session-metadata",
    ]);
  });
});
