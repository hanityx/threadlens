import test from "node:test";
import assert from "node:assert/strict";
import { getSessionsFetchLimit, shouldRefetchSessions } from "../src/lib/sessionFetchWindow.js";

test("uses the default sessions window when no filter is active", () => {
  assert.equal(getSessionsFetchLimit(""), 240);
  assert.equal(getSessionsFetchLimit("   "), 240);
});

test("expands the sessions window while filtering", () => {
  assert.equal(getSessionsFetchLimit("rename"), 1000);
  assert.equal(getSessionsFetchLimit("  codex rename  "), 1000);
});

test("does not refetch when the current window already covers the filter mode", () => {
  assert.equal(shouldRefetchSessions(false, 240, ""), false);
  assert.equal(shouldRefetchSessions(false, 1000, "rename"), false);
});

test("refetches when switching provider or expanding into filter mode", () => {
  assert.equal(shouldRefetchSessions(true, 240, ""), true);
  assert.equal(shouldRefetchSessions(false, 240, "rename"), true);
});
