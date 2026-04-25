import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createServer,
  requiresLocalApiToken,
  parseConversationSearchProviders,
} from "./create-server.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseConversationSearchProviders", () => {
  it("accepts comma-separated provider ids", () => {
    expect(
      parseConversationSearchProviders("codex,chatgpt,copilot"),
    ).toEqual({
      providers: ["codex", "chatgpt", "copilot"],
      invalid: [],
    });
  });

  it("dedupes repeated providers and reports invalid tokens", () => {
    expect(
      parseConversationSearchProviders(["codex,chatgpt", "codex,unknown"]),
    ).toEqual({
      providers: ["codex", "chatgpt"],
      invalid: ["unknown"],
    });
  });
});

describe("local API auth guard", () => {
  it("keeps only health and preflight requests public", () => {
    expect(requiresLocalApiToken("GET", "/api/healthz")).toBe(false);
    expect(requiresLocalApiToken("OPTIONS", "/api/local-cleanup")).toBe(false);
    expect(requiresLocalApiToken("POST", "/api/local-cleanup")).toBe(true);
    expect(requiresLocalApiToken("POST", "/api/provider-session-action")).toBe(true);
    expect(requiresLocalApiToken("GET", "/api/overview")).toBe(true);
    expect(requiresLocalApiToken("POST", "/api/conversation-search")).toBe(true);
  });

  it("allows health checks without a token when a desktop token is configured", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "secret-token");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/healthz",
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("rejects API requests without the desktop API token", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "secret-token");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/local-cleanup",
        payload: { ids: ["abc"], dry_run: true },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        ok: false,
        data: null,
        error: "api-auth-required",
      });
    } finally {
      await app.close();
    }
  });

  it("lets API requests reach route validation with a valid token", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "secret-token");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/local-cleanup",
        headers: { "x-threadlens-api-token": "secret-token" },
        payload: {},
      });

      expect(response.statusCode).not.toBe(401);
      expect(String(response.json().error)).toContain("expected array");
    } finally {
      await app.close();
    }
  });
});
