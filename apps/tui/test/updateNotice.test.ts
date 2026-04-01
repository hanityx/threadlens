import test from "node:test";
import assert from "node:assert/strict";
import { buildUpdateNoticeLine, buildUpdateNoticeSummary } from "../src/lib/updateNotice.js";

test("buildUpdateNoticeLine returns a compact update message", () => {
  const line = buildUpdateNoticeLine({
    checked_at: "2026-04-02T00:00:00.000Z",
    current_version: "0.1.0",
    latest_version: "0.1.1",
    release_title: "ThreadLens v0.1.1",
    release_summary: "Codex rename sync now reflects immediately.",
    has_update: true,
    release_url: "https://github.com/hanityx/threadlens/releases/tag/v0.1.1",
    source: "github-releases",
    status: "available",
    error: null,
  });

  assert.match(line ?? "", /Update available: v0\.1\.1/);
  assert.match(line ?? "", /current v0\.1\.0/);
});

test("buildUpdateNoticeSummary prefers the release summary", () => {
  const summary = buildUpdateNoticeSummary({
    checked_at: "2026-04-02T00:00:00.000Z",
    current_version: "0.1.0",
    latest_version: "0.1.1",
    release_title: "ThreadLens v0.1.1",
    release_summary: "Codex rename sync now reflects immediately.",
    has_update: true,
    release_url: "https://github.com/hanityx/threadlens/releases/tag/v0.1.1",
    source: "github-releases",
    status: "available",
    error: null,
  });

  assert.equal(summary, "Codex rename sync now reflects immediately.");
});
