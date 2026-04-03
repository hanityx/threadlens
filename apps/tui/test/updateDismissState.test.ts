import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  persistDismissedUpdateVersion,
  readDismissedUpdateVersion,
  resolveUpdateDismissStatePath,
  shouldDisplayUpdateNotice,
} from "../src/lib/updateDismissState.js";

test("resolveUpdateDismissStatePath uses THREADLENS_TUI_STATE_DIR when provided", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "threadlens-tui-state-"));
  const original = process.env.THREADLENS_TUI_STATE_DIR;
  process.env.THREADLENS_TUI_STATE_DIR = stateDir;

  try {
    assert.equal(
      resolveUpdateDismissStatePath(),
      path.join(stateDir, "update-notice.json"),
    );
  } finally {
    if (original === undefined) delete process.env.THREADLENS_TUI_STATE_DIR;
    else process.env.THREADLENS_TUI_STATE_DIR = original;
  }
});

test("persistDismissedUpdateVersion stores the latest dismissed version", () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "threadlens-tui-state-"));
  const statePath = path.join(stateDir, "update-notice.json");

  persistDismissedUpdateVersion("0.1.1", statePath);

  assert.equal(readDismissedUpdateVersion(statePath), "0.1.1");
  assert.match(readFileSync(statePath, "utf8"), /0.1.1/);
});

test("shouldDisplayUpdateNotice hides only the dismissed version", () => {
  assert.equal(
    shouldDisplayUpdateNotice({
      has_update: true,
      latest_version: "0.1.1",
    }, "0.1.1"),
    false,
  );
  assert.equal(
    shouldDisplayUpdateNotice({
      has_update: true,
      latest_version: "0.1.2",
    }, "0.1.1"),
    true,
  );
});
