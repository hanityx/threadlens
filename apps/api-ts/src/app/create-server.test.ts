import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createServer,
  isProtectedLocalApiRequest,
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
  it("classifies only protected mutation paths", () => {
    expect(isProtectedLocalApiRequest("POST", "/api/local-cleanup")).toBe(true);
    expect(isProtectedLocalApiRequest("POST", "/api/provider-session-action")).toBe(true);
    expect(isProtectedLocalApiRequest("GET", "/api/healthz")).toBe(false);
    expect(isProtectedLocalApiRequest("POST", "/api/conversation-search")).toBe(false);
  });

  it("allows read-only endpoints without a token when a desktop token is configured", async () => {
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

  it("rejects protected local actions without the desktop API token", async () => {
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

  it("lets protected local actions reach route validation with a valid token", async () => {
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
