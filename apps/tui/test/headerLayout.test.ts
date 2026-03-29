import test from "node:test";
import assert from "node:assert/strict";
import { resolveHeaderLayout } from "../src/lib/headerLayout.js";

test("resolveHeaderLayout stacks header metadata on narrow terminals", () => {
  const layout = resolveHeaderLayout({
    columns: 80,
    apiLabel: "api:8788",
  });

  assert.equal(layout.stacked, true);
  assert.equal(layout.metaText, "api:8788 · ? · q");
});

test("resolveHeaderLayout keeps a single-line header on wide terminals", () => {
  const layout = resolveHeaderLayout({
    columns: 120,
    apiLabel: "api:8788",
  });

  assert.equal(layout.stacked, false);
  assert.equal(layout.metaText, "api:8788  ·  ? help  ·  q quit");
});
