import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@threadlens/shared-contracts": fileURLToPath(
        new URL("../../packages/shared-contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.endsWith("/src/i18n/en.ts") ||
            id.endsWith("/src/i18n/canonicalEnglish.ts")
          ) {
            return "locale-core";
          }
          const localeMatch = id.match(
            /\/src\/i18n\/(ko|ja|zh-CN|pt-BR|es|hi|de|id|ru)\.ts$/,
          );
          if (localeMatch) {
            return `locale-${localeMatch[1]}`;
          }
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tanstack/react-query")) return "react-query";
          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
      onwarn(warning, warn) {
        const message = String(warning.message || "");
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          message.includes("use client")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
}));
