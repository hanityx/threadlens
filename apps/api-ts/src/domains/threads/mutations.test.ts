import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveThreadsLocalTs,
  getThreadResumeCommandsTs,
  renameThreadTitleTs,
  setThreadPinnedTs,
  unarchiveThreadsLocalTs,
} from "./state.js";

describe("thread mutations", () => {
  it("renameThreadTitleTs updates thread-titles in a state file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-mutations-"));
    const stateFilePath = path.join(root, ".codex", ".codex-global-state.json");
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(
      stateFilePath,
      JSON.stringify(
        {
          "thread-titles": {
            titles: { "thread-1": "Old title" },
            order: ["thread-1"],
          },
          "pinned-thread-ids": ["thread-1"],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await renameThreadTitleTs("thread-1", "New title", {
      stateFilePath,
    });
    expect(result.ok).toBe(true);

    const saved = JSON.parse(await readFile(stateFilePath, "utf-8"));
    expect(saved["thread-titles"].titles["thread-1"]).toBe("New title");
    expect(saved["thread-titles"].order).toEqual(["thread-1"]);
    expect(saved["pinned-thread-ids"]).toEqual(["thread-1"]);
  });

  it("setThreadPinnedTs appends and removes pinned ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-pinned-"));
    const stateFilePath = path.join(root, ".codex", ".codex-global-state.json");
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(
      stateFilePath,
      JSON.stringify({ "pinned-thread-ids": ["thread-1"] }, null, 2),
      "utf-8",
    );

    const pinResult = await setThreadPinnedTs(["thread-2"], true, { stateFilePath });
    expect(pinResult.ok).toBe(true);
    let saved = JSON.parse(await readFile(stateFilePath, "utf-8"));
    expect(saved["pinned-thread-ids"]).toEqual(["thread-1", "thread-2"]);

    const unpinResult = await setThreadPinnedTs(["thread-1"], false, { stateFilePath });
    expect(unpinResult.ok).toBe(true);
    saved = JSON.parse(await readFile(stateFilePath, "utf-8"));
    expect(saved["pinned-thread-ids"]).toEqual(["thread-2"]);
  });

  it("archiveThreadsLocalTs removes title/order/pinned refs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-archive-"));
    const stateFilePath = path.join(root, ".codex", ".codex-global-state.json");
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(
      stateFilePath,
      JSON.stringify(
        {
          "thread-titles": {
            titles: { "thread-1": "One", "thread-2": "Two" },
            order: ["thread-1", "thread-2"],
          },
          "pinned-thread-ids": ["thread-1"],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await archiveThreadsLocalTs(["thread-1"], { stateFilePath });
    expect(result.ok).toBe(true);
    const saved = JSON.parse(await readFile(stateFilePath, "utf-8"));
    expect(saved["thread-titles"].titles).toEqual({ "thread-2": "Two" });
    expect(saved["thread-titles"].order).toEqual(["thread-2"]);
    expect(saved["pinned-thread-ids"]).toEqual([]);
    expect(saved["archived-thread-ids"]).toEqual(["thread-1"]);
  });

  it("unarchiveThreadsLocalTs removes ids from the local archive list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-unarchive-"));
    const stateFilePath = path.join(root, ".codex", ".codex-global-state.json");
    await mkdir(path.dirname(stateFilePath), { recursive: true });
    await writeFile(
      stateFilePath,
      JSON.stringify({ "archived-thread-ids": ["thread-1", "thread-2"] }, null, 2),
      "utf-8",
    );

    const result = await unarchiveThreadsLocalTs(["thread-1"], { stateFilePath });
    expect(result.ok).toBe(true);
    const saved = JSON.parse(await readFile(stateFilePath, "utf-8"));
    expect(saved["archived-thread-ids"]).toEqual(["thread-2"]);
  });

  it("getThreadResumeCommandsTs returns codex resume commands", async () => {
    const result = getThreadResumeCommandsTs(["thread-1", "thread-2"]);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(result.commands).toEqual([
      "codex resume thread-1",
      "codex resume thread-2",
    ]);
  });
});
