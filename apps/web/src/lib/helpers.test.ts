import { describe, expect, it } from "vitest";
import { compactPath } from "./helpers";

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
