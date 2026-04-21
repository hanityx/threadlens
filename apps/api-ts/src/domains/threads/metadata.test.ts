import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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

  it("collects local data presence and project buckets from chat cache roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-thread-local-refs-"));
    const chatDir = path.join(root, "chat");
    const directRoot = path.join(chatDir, "conversations-v3-main");
    const projectRoot = path.join(chatDir, "project-g-p-demo");
    const projectConvRoot = path.join(projectRoot, "conversations-v3-2026");

    await mkdir(directRoot, { recursive: true });
    await mkdir(projectConvRoot, { recursive: true });
    await writeFile(path.join(directRoot, "thread-1.data"), "cache", "utf-8");
    await writeFile(path.join(projectConvRoot, "thread-2.data"), "cache", "utf-8");

    const { refs, bucketCounts } = await collectCodexLocalRefs(["thread-1", "thread-2"], chatDir);

    expect(refs.get("thread-1")).toMatchObject({
      has_local_data: true,
    });
    expect(Array.from(refs.get("thread-1")?.project_buckets ?? [])).toEqual([]);
    expect(refs.get("thread-2")).toMatchObject({
      has_local_data: true,
    });
    expect(Array.from(refs.get("thread-2")?.project_buckets ?? [])).toEqual(["project-g-p-demo"]);
    expect(bucketCounts.get("project-g-p-demo")).toBe(1);
  });
});
