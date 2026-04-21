import { describe, expect, it } from "vitest";
import viteConfigFactory from "../../vite.config";

function resolveBuildConfig() {
  return typeof viteConfigFactory === "function"
    ? viteConfigFactory({
        command: "build",
        mode: "test",
        isSsrBuild: false,
        isPreview: false,
      })
    : viteConfigFactory;
}

function getManualChunks() {
  const config = resolveBuildConfig();
  const output = config.build?.rollupOptions?.output;
  if (!output || Array.isArray(output)) {
    throw new Error("Expected a single rollup output config");
  }
  if (typeof output.manualChunks !== "function") {
    throw new Error("Expected manualChunks to be configured");
  }
  return output.manualChunks;
}

const manualChunkMeta = {
  getModuleIds: () => [],
  getModuleInfo: () => null,
} as const;

describe("vite manual chunking", () => {
  it("splits locale modules into per-locale chunks", () => {
    const manualChunks = getManualChunks();

    expect(manualChunks("/repo/apps/web/src/i18n/en.ts", manualChunkMeta)).toBe("locale-core");
    expect(manualChunks("/repo/apps/web/src/i18n/ko.ts", manualChunkMeta)).toBe("locale-ko");
    expect(manualChunks("/repo/apps/web/src/i18n/ja.ts", manualChunkMeta)).toBe("locale-ja");
    expect(manualChunks("/repo/apps/web/src/i18n/zh-CN.ts", manualChunkMeta)).toBe(
      "locale-zh-CN",
    );
  });

  it("keeps runtime i18n helpers in the shared locale core chunk", () => {
    const manualChunks = getManualChunks();

    expect(manualChunks("/repo/apps/web/src/i18n/index.ts", manualChunkMeta)).toBeUndefined();
    expect(manualChunks("/repo/apps/web/src/i18n/canonicalEnglish.ts", manualChunkMeta)).toBe(
      "locale-core",
    );
  });
});
