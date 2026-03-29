import test from "node:test";
import assert from "node:assert/strict";
import type { ThreadRow } from "../src/types.js";
import { filterCleanupRows, matchesCleanupFilter } from "../src/lib/cleanupFilter.js";

const rows: ThreadRow[] = [
  {
    thread_id: "019d355d-51c3-7753-b2f2-8db585337e41",
    title: "스레드렌즈 3월29일 세션 핸드오프 세션.",
    risk_score: 54,
    is_pinned: false,
    source: "sessions",
    risk_level: "medium",
    risk_tags: ["internal", "ctx-high"],
  },
  {
    thread_id: "019d38c5-1784-7792-a022-b5fabfdf53a5",
    title: "이 세션 이름 지정 가능해?",
    risk_score: 54,
    is_pinned: false,
    source: "sessions",
    risk_level: "medium",
    risk_tags: ["naming"],
  },
];

test("matchesCleanupFilter matches exact thread id queries", () => {
  assert.equal(matchesCleanupFilter(rows[0]!, "019d355d-51c3-7753-b2f2-8db585337e41"), true);
  assert.equal(matchesCleanupFilter(rows[1]!, "019d355d-51c3-7753-b2f2-8db585337e41"), false);
});

test("filterCleanupRows narrows rows to the matching thread id", () => {
  const filtered = filterCleanupRows(rows, "019d355d-51c3-7753-b2f2-8db585337e41");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.thread_id, "019d355d-51c3-7753-b2f2-8db585337e41");
});

test("filterCleanupRows matches risk tags and source text", () => {
  assert.equal(filterCleanupRows(rows, "ctx-high").length, 1);
  assert.equal(filterCleanupRows(rows, "sessions").length, 2);
});
