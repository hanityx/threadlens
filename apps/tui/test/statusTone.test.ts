import test from "node:test";
import assert from "node:assert/strict";
import { statusToneColor } from "../src/lib/statusTone.js";

test("statusToneColor maps tones without relying on localized strings", () => {
  assert.equal(statusToneColor("idle"), "gray");
  assert.equal(statusToneColor("running"), "yellow");
  assert.equal(statusToneColor("pending"), "yellow");
  assert.equal(statusToneColor("success"), "green");
  assert.equal(statusToneColor("error"), "red");
});
