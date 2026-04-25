import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeSafeThreadIds,
  parseSafeThreadId,
  resolveThreadCacheFile,
} from "./thread-id.js";

describe("thread id safety", () => {
  it("accepts UUID-like thread ids and rejects path traversal payloads", () => {
    expect(parseSafeThreadId("019d5de6-49b6-76b2-9626-e8e63eb8f021")).toBe(
      "019d5de6-49b6-76b2-9626-e8e63eb8f021",
    );
    expect(parseSafeThreadId("../victim")).toBeNull();
    expect(parseSafeThreadId("../../victim")).toBeNull();
    expect(parseSafeThreadId("..\\victim")).toBeNull();
    expect(parseSafeThreadId("/absolute/path")).toBeNull();
    expect(parseSafeThreadId("C:\\absolute\\path")).toBeNull();
  });

  it("dedupes valid ids while reporting invalid ids", () => {
    expect(normalizeSafeThreadIds(["thread-1", "thread-1", "../victim"])).toEqual({
      ids: ["thread-1"],
      invalid: ["../victim"],
    });
  });

  it("resolves cache files inside the conversation root only", () => {
    const root = path.join(os.tmpdir(), "threadlens-cache-root");
    expect(resolveThreadCacheFile(root, "thread-1")).toBe(path.join(root, "thread-1.data"));
    expect(resolveThreadCacheFile(root, "../victim")).toBeNull();
  });
});
