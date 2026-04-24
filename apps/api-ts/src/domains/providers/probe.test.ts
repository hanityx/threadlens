import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferSessionId, probeSessionFile } from "./probe.js";

describe("provider probe helpers", () => {
  it("extracts session ids from jsonl-like file names", () => {
    expect(
      inferSessionId("/tmp/rollout-2026-03-25T10-00-00-019d-search-test.jsonl"),
    ).toBe("rollout-2026-03-25T10-00-00-019d-search-test");
    expect(inferSessionId("/tmp/12345678-1234-1234-1234-1234567890ab.json")).toBe(
      "12345678-1234-1234-1234-1234567890ab",
    );
  });

  it("treats binary provider caches as readable id hints", async () => {
    await expect(
      probeSessionFile("/tmp/rollout-2026-03-25T10-00-00-019d-binary-session.pb"),
    ).resolves.toMatchObject({
      ok: true,
      format: "unknown",
      error: null,
      detected_title: "rollout-2026-03-25T10-00-00-019d-binary-session",
      title_source: "binary-cache-id",
    });
  });

  it("rejects unsupported text extensions", async () => {
    await expect(probeSessionFile("/tmp/session.txt")).resolves.toMatchObject({
      ok: false,
      format: "unknown",
      error: "unsupported extension",
    });
  });

  it("does not fail long multibyte jsonl first lines that exceed the head byte limit", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "threadlens-probe-"));
    const filePath = path.join(dir, "long-first-line.jsonl");
    const longKoreanText = "문장".repeat(4500);

    try {
      await writeFile(
        filePath,
        `${JSON.stringify({ type: "event_msg", message: longKoreanText })}\n${JSON.stringify({ type: "done" })}\n`,
        "utf8",
      );

      await expect(probeSessionFile(filePath)).resolves.toMatchObject({
        ok: true,
        format: "jsonl",
        error: null,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
