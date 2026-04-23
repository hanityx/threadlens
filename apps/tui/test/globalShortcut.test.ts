import test from "node:test";
import assert from "node:assert/strict";
import { isReservedGlobalShortcut } from "../src/lib/globalShortcut.js";

test("isReservedGlobalShortcut keeps global nav keys out of text entry", () => {
  assert.equal(isReservedGlobalShortcut("?"), true);
  assert.equal(isReservedGlobalShortcut("1"), true);
  assert.equal(isReservedGlobalShortcut("2"), true);
  assert.equal(isReservedGlobalShortcut("3"), true);
  assert.equal(isReservedGlobalShortcut("q"), true);
  assert.equal(isReservedGlobalShortcut("o"), false);
  assert.equal(isReservedGlobalShortcut("u"), false);
  assert.equal(isReservedGlobalShortcut("u", { includeUpdateShortcuts: true }), true);
  assert.equal(isReservedGlobalShortcut("U", { includeUpdateShortcuts: true }), true);
});
