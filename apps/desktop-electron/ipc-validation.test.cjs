const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOptionalString,
  parseFileActionPayload,
  parseOpenWindowPayload,
  requirePathString,
  requireTrimmedString,
  resolveExistingPath,
} = require("./ipc-validation.cjs");

test("requireTrimmedString rejects non-string or blank input", () => {
  assert.throws(() => requireTrimmedString(null, "File path"), /must be a string/);
  assert.throws(() => requireTrimmedString("   ", "File path"), /is required/);
});

test("parseFileActionPayload validates supported action and trims file path", () => {
  assert.deepEqual(parseFileActionPayload({ action: " open ", filePath: " ./tmp/file.jsonl " }), {
    action: "open",
    filePath: " ./tmp/file.jsonl ",
  });
  assert.throws(() => parseFileActionPayload({ action: "delete", filePath: "./tmp/file.jsonl" }), /Unsupported file action/);
  assert.equal(requirePathString(" /tmp/ spaced .jsonl ", "File path"), " /tmp/ spaced .jsonl ");
});

test("parseOpenWindowPayload normalizes only string fields", () => {
  assert.deepEqual(parseOpenWindowPayload({
    view: " providers ",
    provider: 1,
    filePath: " /tmp/a.jsonl ",
    threadId: null,
  }), {
    view: "providers",
    provider: "",
    filePath: " /tmp/a.jsonl ",
    threadId: "",
  });
  assert.equal(normalizeOptionalString(undefined), "");
});

test("resolveExistingPath preserves whitespace in real file names", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "threadlens-desktop-"));
  const weirdPath = path.join(tmpDir, " file with space .jsonl ");
  fs.writeFileSync(weirdPath, "ok");
  assert.equal(resolveExistingPath(weirdPath), path.resolve(weirdPath));
  assert.throws(() => resolveExistingPath("   "), /File path is required/);
});
