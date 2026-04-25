const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildDesktopApiBaseUrl,
  buildDesktopApiEnv,
  logDesktopApi,
  resolveDesktopApiEntry,
} = require("./api-lifecycle.cjs");

test("buildDesktopApiBaseUrl uses host and port consistently", () => {
  assert.equal(buildDesktopApiBaseUrl("127.0.0.1", 8788), "http://127.0.0.1:8788");
});

test("buildDesktopApiEnv injects desktop runtime variables", () => {
  const env = buildDesktopApiEnv({
    baseEnv: { HOME: "/tmp/home" },
    apiPort: 8790,
    apiToken: "desktop-token",
    appVersion: "0.2.2",
    stateRoot: "/tmp/threadlens-state",
  });

  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.API_TS_PORT, "8790");
  assert.equal(env.APP_VERSION, "0.2.2");
  assert.equal(env.THREADLENS_PROJECT_ROOT, "/tmp/threadlens-state");
  assert.equal(env.THREADLENS_API_TOKEN, "desktop-token");
  assert.equal(env.HOME, "/tmp/home");
});

test("buildDesktopApiEnv omits the API token when no desktop token is provided", () => {
  const env = buildDesktopApiEnv({
    baseEnv: {},
    apiPort: 8790,
    appVersion: "0.2.2",
    stateRoot: "/tmp/threadlens-state",
  });

  assert.equal(Object.prototype.hasOwnProperty.call(env, "THREADLENS_API_TOKEN"), false);
});

test("resolveDesktopApiEntry picks packaged and dev entries separately", () => {
  assert.equal(
    resolveDesktopApiEntry({
      appDir: "/tmp/desktop",
      isPackaged: false,
      resourcesPath: "/tmp/resources",
    }),
    path.join("/tmp/desktop", "app", "api", "server.cjs"),
  );

  assert.equal(
    resolveDesktopApiEntry({
      appDir: "/tmp/desktop",
      isPackaged: true,
      resourcesPath: "/tmp/resources",
    }),
    path.join("/tmp/resources", "app.asar.unpacked", "app", "api", "server.cjs"),
  );
});

test("logDesktopApi prefixes and splits chunks into lines per stream", () => {
  const logs = [];
  const errs = [];
  const logger = {
    log: (line) => logs.push(line),
    error: (line) => errs.push(line),
  };

  logDesktopApi("log", "hello\nworld\n", logger);
  logDesktopApi("error", "boom", logger);

  assert.deepEqual(logs, ["[desktop-api] hello", "[desktop-api] world"]);
  assert.deepEqual(errs, ["[desktop-api] boom"]);
});

test("logDesktopApi swallows EPIPE from a broken logger instead of throwing", () => {
  const attempted = [];
  const logger = {
    log: (line) => {
      attempted.push(line);
      const err = new Error("write EPIPE");
      err.code = "EPIPE";
      throw err;
    },
    error: () => {
      const err = new Error("write EPIPE");
      err.code = "EPIPE";
      throw err;
    },
  };

  assert.doesNotThrow(() => logDesktopApi("log", "one\ntwo\nthree", logger));
  assert.deepEqual(attempted, [
    "[desktop-api] one",
    "[desktop-api] two",
    "[desktop-api] three",
  ]);
});
