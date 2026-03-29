import test from "node:test";
import assert from "node:assert/strict";
import { shouldLeaveSearchQueryMode } from "../src/lib/searchFocus.js";

test("query mode can be exited even before results exist", () => {
  assert.equal(shouldLeaveSearchQueryMode({ tab: true }), true);
  assert.equal(shouldLeaveSearchQueryMode({ return: true }), true);
  assert.equal(shouldLeaveSearchQueryMode({ escape: true }), true);
});

test("non-navigation keys keep query mode active", () => {
  assert.equal(shouldLeaveSearchQueryMode({}), false);
  assert.equal(shouldLeaveSearchQueryMode({ upArrow: true }), false);
  assert.equal(shouldLeaveSearchQueryMode({ downArrow: true }), false);
});
