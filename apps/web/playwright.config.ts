import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 30_000,
  },
  retries: 0,
  workers: 1,
  reporter: "line",
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5180",
    port: 5180,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5180",
    headless: true,
    viewport: { width: 1600, height: 1100 },
    colorScheme: "dark",
  },
});
