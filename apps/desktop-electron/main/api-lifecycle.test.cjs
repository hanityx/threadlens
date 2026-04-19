const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildDesktopApiBaseUrl,
  buildDesktopApiEnv,
  resolveDesktopApiEntry,
} = require("./api-lifecycle.cjs");

test("buildDesktopApiBaseUrl uses host and port consistently", () => {
  assert.equal(buildDesktopApiBaseUrl("127.0.0.1", 8788), "http://127.0.0.1:8788");
});

test("buildDesktopApiEnv injects desktop runtime variables", () => {
  const env = buildDesktopApiEnv({
    baseEnv: { HOME: "/tmp/home" },
    apiPort: 8790,
    appVersion: "0.2.2",
    stateRoot: "/tmp/threadlens-state",
  });

  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.API_TS_PORT, "8790");
  assert.equal(env.APP_VERSION, "0.2.2");
  assert.equal(env.THREADLENS_PROJECT_ROOT, "/tmp/threadlens-state");
  assert.equal(env.HOME, "/tmp/home");
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
