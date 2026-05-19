import test from "node:test";
import assert from "node:assert/strict";
import { getSessionsFetchLimit, shouldRefetchSessions } from "../src/lib/sessionFetchWindow.js";

test("uses the default sessions window when no filter is active", () => {
  assert.equal(getSessionsFetchLimit(""), 240);
  assert.equal(getSessionsFetchLimit("   "), 240);
});

test("keeps the API-capped sessions window while filtering", () => {
  assert.equal(getSessionsFetchLimit("rename"), 240);
  assert.equal(getSessionsFetchLimit("  codex rename  "), 240);
});

test("does not refetch when the current window already covers the filter mode", () => {
  assert.equal(shouldRefetchSessions(false, 240, ""), false);
  assert.equal(shouldRefetchSessions(false, 240, "rename"), false);
});

test("refetches when switching provider", () => {
  assert.equal(shouldRefetchSessions(true, 240, ""), true);
  assert.equal(shouldRefetchSessions(true, 240, "rename"), true);
});
