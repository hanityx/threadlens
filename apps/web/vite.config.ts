import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
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
