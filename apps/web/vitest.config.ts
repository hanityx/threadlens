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
  },
});
