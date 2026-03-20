import { defineConfig } from "@playwright/test";

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
    command: "pnpm dev --host 127.0.0.1 --port 5181",
    port: 5181,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_API_PROXY_TARGET: "http://127.0.0.1:8788",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:5181",
    headless: true,
    viewport: { width: 1600, height: 1100 },
    colorScheme: "dark",
  },
});
