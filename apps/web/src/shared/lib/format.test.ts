import { describe, expect, it } from "vitest";
import { compactPath, formatBytes, formatBytesCompact } from "@/shared/lib/format";

const joinedPath = (...parts: string[]) => parts.join("/");

describe("compactPath", () => {
  it("redacts macOS home prefixes generically", () => {
    expect(compactPath(joinedPath("", "Users", "example", "project", "docs", "HANDOFF.md"), 24)).toBe(
      "~/project/docs/HANDOFF.md",
    );
  });

  it("redacts linux home prefixes generically", () => {
    expect(compactPath(joinedPath("", "home", "dev", "threadlens", ".run", "state", "roadmap.json"), 24)).toBe(
      "~/threadlens/.run/state/roadmap.json",
    );
  });

  it("keeps non-home absolute paths untouched aside from truncation", () => {
    expect(compactPath("/tmp/threadlens/session.jsonl", 24)).toBe("/tmp/threadlens/session.jsonl");
  });
});

describe("byte formatters", () => {
  it("formats byte counts for expanded and compact surfaces", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 12)).toBe("12 MB");
    expect(formatBytesCompact(0)).toBe("0B");
    expect(formatBytesCompact(1536)).toBe("1.5KB");
    expect(formatBytesCompact(1024 * 1024 * 12)).toBe("12MB");
  });
});
