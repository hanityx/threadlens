import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@threadlens/shared-contracts": fileURLToPath(
        new URL("../../packages/shared-contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "e2e/**",
      "**/node_modules/**",
      "**/dist/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "json-summary", "html"],
      exclude: [
        ".storybook/**",
        ".local/**",
        "coverage/**",
        "dist/**",
        "e2e/**",
        "e2e-live/**",
        "storybook-static/**",
        "playwright*.config.ts",
        "vite.config.ts",
        "vitest.config.ts",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.{ts,tsx}",
      ],
    },
  },
});
