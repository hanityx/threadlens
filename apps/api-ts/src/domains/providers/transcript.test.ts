import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSessionTranscript } from "./transcript";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) =>
      import("node:fs/promises").then(({ rm }) =>
        rm(dir, { recursive: true, force: true }),
      ),
    ),
  );
});

describe("buildSessionTranscript", () => {
  it("ignores duplicated event_msg user_message entries when response_item already exists", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-transcript-"));
    tmpDirs.push(tmpDir);
    const filePath = path.join(tmpDir, "session.jsonl");
    const duplicateText =
      "Please clean up the remaining localization code, comment the disabled path, and remove the old ko references.";

    await writeFile(
      filePath,
      [
        JSON.stringify({
          timestamp: "2026-03-24T14:13:17.776Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: duplicateText }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-24T14:13:17.776Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: duplicateText,
            images: [],
            local_images: [],
            text_elements: [],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const transcript = await buildSessionTranscript("codex", filePath, 50);

    expect(transcript.messages).toHaveLength(1);
    expect(transcript.messages[0]).toMatchObject({
      role: "user",
      text: duplicateText,
      source_type: "response_item.message",
    });
  });

  it("ignores duplicated event_msg agent_message entries when assistant response_item already exists", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-transcript-"));
    tmpDirs.push(tmpDir);
    const filePath = path.join(tmpDir, "assistant-session.jsonl");
    const duplicateText =
      "Skill check is done, and this task is incremental cleanup of existing memory artifacts, so I am proceeding directly.";

    await writeFile(
      filePath,
      [
        JSON.stringify({
          timestamp: "2026-03-23T19:48:46.140Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            message: duplicateText,
            phase: "commentary",
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-23T19:48:46.140Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: duplicateText }],
            phase: "commentary",
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const transcript = await buildSessionTranscript("codex", filePath, 50);

    expect(transcript.messages).toHaveLength(1);
    expect(transcript.messages[0]).toMatchObject({
      role: "assistant",
      text: duplicateText,
      source_type: "response_item.message",
    });
  });
});
