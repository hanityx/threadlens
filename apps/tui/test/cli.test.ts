import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.js";

test("parseArgs keeps locale from explicit flag", () => {
  const parsed = parseArgs(["--locale", "ko", "--view", "sessions"], { THREADLENS_LOCALE: "en" });
  assert.equal(parsed?.locale, "ko");
  assert.equal(parsed?.initialView, "sessions");
});

test("parseArgs falls back to locale env", () => {
  const parsed = parseArgs(["--query", "rename"], { THREADLENS_LOCALE: "ko-KR" });
  assert.equal(parsed?.locale, "ko");
  assert.equal(parsed?.initialQuery, "rename");
});

test("parseArgs rejects invalid --view values with a localized message", () => {
  assert.throws(
    () => parseArgs(["--view", "invalid"], { THREADLENS_LOCALE: "ko" }),
    /잘못된 --view 값입니다/,
  );
});

test("parseArgs prints localized help text", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    logs.push(String(message ?? ""));
  };

  try {
    const parsed = parseArgs(["--locale", "ko", "--help"], {});
    assert.equal(parsed, null);
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.length, 1);
  assert.match(logs[0], /ThreadLens TUI/);
  assert.match(logs[0], /사용법/);
  assert.match(logs[0], /예시/);
  assert.match(logs[0], /--locale ko/);
});
