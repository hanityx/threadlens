import { defineConfig } from "@playwright/test";

const livePort = Number(process.env.PLAYWRIGHT_LIVE_PORT ?? "5181");
const apiProxyTarget =
  process.env.PLAYWRIGHT_LIVE_API_PROXY_TARGET ?? "http://127.0.0.1:8788";

export default defineConfig({
  testDir: "./e2e-live",
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  retries: 0,
  workers: 1,
  reporter: "line",
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${livePort}`,
    port: livePort,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_API_PROXY_TARGET: apiProxyTarget,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${livePort}`,
    headless: true,
    viewport: { width: 1600, height: 1100 },
    colorScheme: "dark",
  },
});
