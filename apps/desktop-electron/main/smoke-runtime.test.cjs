const test = require("node:test");
const assert = require("node:assert/strict");

const { attachDesktopSmoke } = require("./smoke-runtime.cjs");

test("attachDesktopSmoke completes immediately when load already finished", async () => {
  const events = new Map();
  const exits = [];
  const logs = [];
  const errors = [];

  const win = {
    webContents: {
      once(event, handler) {
        events.set(event, handler);
      },
      isLoadingMainFrame() {
        return false;
      },
      getURL() {
        return "file:///tmp/threadlens/index.html";
      },
    },
  };

  attachDesktopSmoke({
    win,
    app: {
      exit(code) {
        exits.push(code);
      },
    },
    requestHealth: async (url) => {
      assert.equal(url, "http://127.0.0.1:8788/api/healthz");
      return 200;
    },
    apiBaseUrl: "http://127.0.0.1:8788",
    timeoutMs: 200,
    logger: {
      log(message) {
        logs.push(message);
      },
      error(message) {
        errors.push(message);
      },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(typeof events.get("dom-ready"), "function");
  assert.equal(typeof events.get("did-fail-load"), "function");
  assert.deepEqual(errors, []);
  assert.deepEqual(exits, [0]);
  assert.ok(
    logs.some((message) =>
      /\[desktop-smoke\] ready api=http:\/\/127\.0\.0\.1:8788 status=200/.test(message),
    ),
  );
});
