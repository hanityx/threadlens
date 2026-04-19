const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWindowTitle,
  createRouteSearch,
  readInitialRoute,
} = require("./window-runtime.cjs");

test("createRouteSearch includes only defined route params", () => {
  assert.equal(
    createRouteSearch({
      view: "providers",
      provider: "codex",
      filePath: "/tmp/session.jsonl",
      threadId: "",
    }),
    "?view=providers&provider=codex&filePath=%2Ftmp%2Fsession.jsonl",
  );

  assert.equal(createRouteSearch(null), "");
});

test("readInitialRoute parses valid JSON and rejects invalid payloads", () => {
  assert.deepEqual(
    readInitialRoute(
      JSON.stringify({
        view: "providers",
        provider: "codex",
        filePath: "/tmp/session.jsonl",
        threadId: "thread-1",
      }),
    ),
    {
      view: "providers",
      provider: "codex",
      filePath: "/tmp/session.jsonl",
      threadId: "thread-1",
    },
  );

  assert.equal(readInitialRoute("{bad json"), null);
  assert.equal(readInitialRoute(""), null);
});

test("buildWindowTitle appends an optional suffix", () => {
  assert.equal(buildWindowTitle(""), "ThreadLens");
  assert.equal(buildWindowTitle("Review"), "ThreadLens Review");
});
