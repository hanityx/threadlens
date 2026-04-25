import { describe, expect, it, vi } from "vitest";
import {
  resolveApiAuthTokenFromRuntime,
  resolveApiBaseUrlFromRuntime,
} from "@/api";

describe("resolveApiBaseUrlFromRuntime", () => {
  it("prefers explicit env base URL", async () => {
    await expect(
      resolveApiBaseUrlFromRuntime({
        envBaseUrl: "http://127.0.0.1:9999",
        isDev: false,
      }),
    ).resolves.toBe("http://127.0.0.1:9999");
  });

  it("uses the desktop bridge value when available", async () => {
    await expect(
      resolveApiBaseUrlFromRuntime({
        envBaseUrl: "",
        isDev: false,
        runtimeWindow: {
          threadLensDesktop: {
            getApiBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8789"),
          },
        } as never,
      }),
    ).resolves.toBe("http://127.0.0.1:8789");
  });

  it("falls back to the production localhost base when the desktop bridge rejects", async () => {
    await expect(
      resolveApiBaseUrlFromRuntime({
        envBaseUrl: "",
        isDev: false,
        runtimeWindow: {
          threadLensDesktop: {
            getApiBaseUrl: vi.fn().mockRejectedValue(new Error("ipc unavailable")),
          },
        } as never,
      }),
    ).resolves.toBe("http://127.0.0.1:8788");
  });

  it("keeps the dev relative base when no bridge value resolves", async () => {
    await expect(
      resolveApiBaseUrlFromRuntime({
        envBaseUrl: "",
        isDev: true,
      }),
    ).resolves.toBe("");
  });
});

describe("resolveApiAuthTokenFromRuntime", () => {
  it("prefers explicit env tokens", async () => {
    await expect(
      resolveApiAuthTokenFromRuntime({
        envToken: "env-token",
      }),
    ).resolves.toBe("env-token");
  });

  it("uses the desktop bridge token when available", async () => {
    await expect(
      resolveApiAuthTokenFromRuntime({
        envToken: "",
        runtimeWindow: {
          threadLensDesktop: {
            getApiAuthToken: vi.fn().mockResolvedValue("desktop-token"),
          },
        } as never,
      }),
    ).resolves.toBe("desktop-token");
  });

  it("falls back to an empty token when the desktop bridge rejects", async () => {
    await expect(
      resolveApiAuthTokenFromRuntime({
        envToken: "",
        runtimeWindow: {
          threadLensDesktop: {
            getApiAuthToken: vi.fn().mockRejectedValue(new Error("ipc unavailable")),
          },
        } as never,
      }),
    ).resolves.toBe("");
  });
});
