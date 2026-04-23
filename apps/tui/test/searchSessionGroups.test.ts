import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSearchSessions,
  resolveSearchSelectionIndex,
} from "../src/views/SearchView.js";
import type { SearchSession } from "../src/types.js";

test("groupSearchSessions uses session-first payload without flattening distinct sessions", () => {
  const sessions: SearchSession[] = [
    {
      provider: "codex",
      session_id: "rollout-a",
      thread_id: "thread-a",
      title: "Token story A",
      display_title: "Token story A",
      file_path: "/tmp/a.jsonl",
      source: "sessions",
      mtime: "2026-04-22T10:00:00.000Z",
      match_count: 7,
      title_match_count: 0,
      best_match_kind: "message",
      has_more_hits: true,
      preview_matches: [
        {
          provider: "codex",
          session_id: "rollout-a",
          thread_id: "thread-a",
          title: "Token story A",
          display_title: "Token story A",
          file_path: "/tmp/a.jsonl",
          mtime: "2026-04-22T10:00:00.000Z",
          match_kind: "message",
          snippet: "token appears in session A",
          source: "sessions",
        },
      ],
    },
    {
      provider: "codex",
      session_id: "rollout-b",
      thread_id: "thread-b",
      title: "Token story B",
      display_title: "Token story B",
      file_path: "/tmp/b.jsonl",
      source: "sessions",
      mtime: "2026-04-22T09:00:00.000Z",
      match_count: 2,
      title_match_count: 0,
      best_match_kind: "message",
      has_more_hits: false,
      preview_matches: [
        {
          provider: "codex",
          session_id: "rollout-b",
          thread_id: "thread-b",
          title: "Token story B",
          display_title: "Token story B",
          file_path: "/tmp/b.jsonl",
          mtime: "2026-04-22T09:00:00.000Z",
          match_kind: "message",
          snippet: "token appears in session B",
          source: "sessions",
        },
      ],
    },
  ];

  const grouped = groupSearchSessions(sessions);
  assert.equal(grouped.length, 2);
  assert.deepEqual(
    grouped.map((group) => ({
      key: group.key,
      matchCount: group.matchCount,
      snippets: group.snippets,
    })),
    [
      {
        key: "codex::rollout-a",
        matchCount: 7,
        snippets: ["token appears in session A"],
      },
      {
        key: "codex::rollout-b",
        matchCount: 2,
        snippets: ["token appears in session B"],
      },
    ],
  );
});

test("resolveSearchSelectionIndex keeps the same selected session after regroup reorders rows", () => {
  const initialSessions: SearchSession[] = [
    {
      provider: "codex",
      session_id: "rollout-a",
      thread_id: "thread-a",
      title: "Token story A",
      display_title: "Token story A",
      file_path: "/tmp/a.jsonl",
      source: "sessions",
      mtime: "2026-04-22T10:00:00.000Z",
      match_count: 7,
      title_match_count: 0,
      best_match_kind: "message",
      has_more_hits: false,
      preview_matches: [],
    },
    {
      provider: "codex",
      session_id: "rollout-b",
      thread_id: "thread-b",
      title: "Token story B",
      display_title: "Token story B",
      file_path: "/tmp/b.jsonl",
      source: "sessions",
      mtime: "2026-04-22T09:00:00.000Z",
      match_count: 5,
      title_match_count: 0,
      best_match_kind: "message",
      has_more_hits: false,
      preview_matches: [],
    },
  ];
  const appendedSessions: SearchSession[] = [
    ...initialSessions,
    {
      provider: "codex",
      session_id: "rollout-c",
      thread_id: "thread-c",
      title: "Token story C",
      display_title: "Token story C",
      file_path: "/tmp/c.jsonl",
      source: "sessions",
      mtime: "2026-04-22T11:00:00.000Z",
      match_count: 9,
      title_match_count: 0,
      best_match_kind: "message",
      has_more_hits: false,
      preview_matches: [],
    },
  ];

  const initialGroups = groupSearchSessions(initialSessions);
  const selectedIndex = 1;
  const selectedKey = initialGroups[selectedIndex]?.key ?? null;
  const regrouped = groupSearchSessions(appendedSessions);

  const nextIndex = resolveSearchSelectionIndex(regrouped, selectedIndex, selectedKey);

  assert.equal(selectedKey, "codex::rollout-b");
  assert.equal(nextIndex, 2);
  assert.equal(regrouped[nextIndex]?.key, "codex::rollout-b");
});
