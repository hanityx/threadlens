import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectCodexLocalRefs,
  readCodexSessionMeta,
  readCodexSessionMetaForThreadIdWithResolver,
} from "./metadata.js";

describe("thread metadata", () => {
  it("reads cwd from codex session meta", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-meta-"));
    const sessionFile = path.join(root, "rollout-thread-1.jsonl");
    await writeFile(
      sessionFile,
      [
        JSON.stringify({ type: "session_meta", payload: { cwd: "/tmp/demo-workspace" } }),
        JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: "hello" } }),
      ].join("\n"),
      "utf-8",
    );

    const result = await readCodexSessionMetaForThreadIdWithResolver(
      "thread-1",
      async (threadId) => (threadId === "thread-1" ? sessionFile : null),
    );

    expect(result).toEqual({
      has_session_log: true,
      cwd: "/tmp/demo-workspace",
    });
  });

  it("reads cwd when the session_meta line is larger than the file-head byte window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-meta-long-"));
    const sessionFile = path.join(root, "rollout-thread-long.jsonl");
    await writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            cwd: "/tmp/long-demo-workspace",
            base_instructions: "x".repeat(20_000),
          },
        }),
        JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: "hello" } }),
      ].join("\n"),
      "utf-8",
    );

    await expect(readCodexSessionMeta(sessionFile)).resolves.toEqual({
      has_session_log: true,
      cwd: "/tmp/long-demo-workspace",
    });
  });

  it("does not collect removed desktop cache roots as local data", async () => {
    const { refs, bucketCounts } = await collectCodexLocalRefs(["thread-1", "thread-2"]);

    expect(refs.get("thread-1")).toMatchObject({
      has_local_data: false,
    });
    expect(Array.from(refs.get("thread-1")?.project_buckets ?? [])).toEqual([]);
    expect(refs.get("thread-2")).toMatchObject({
      has_local_data: false,
    });
    expect(Array.from(refs.get("thread-2")?.project_buckets ?? [])).toEqual([]);
    expect(bucketCounts.size).toBe(0);
  });
});
