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
      parseConversationSearchProviders("codex,claude,copilot"),
    ).toEqual({
      providers: ["codex", "claude", "copilot"],
      invalid: [],
    });
  });

  it("dedupes repeated providers and reports invalid tokens", () => {
    expect(
      parseConversationSearchProviders(["codex,claude", "codex,unknown"]),
    ).toEqual({
      providers: ["codex", "claude"],
      invalid: ["unknown"],
    });
  });

  it("keeps removed providers out of public search scope", () => {
    expect(parseConversationSearchProviders("codex,removed-provider")).toEqual({
      providers: ["codex"],
      invalid: ["removed-provider"],
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
    expect(requiresLocalApiToken("GET", "/api/recovery-backup-export/download")).toBe(true);
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

  it("lets authenticated recovery backup download requests reach token validation", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "secret-token");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/recovery-backup-export/download?token=00000000-0000-4000-8000-000000000000",
        headers: { "x-threadlens-api-token": "secret-token" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        ok: false,
        error: "recovery-backup-export-download-not-found",
      });
    } finally {
      await app.close();
    }
  });

  it("allows packaged Electron Origin null preflight for token-authenticated requests", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "secret-token");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/recovery-backup-export/download?token=00000000-0000-4000-8000-000000000000",
        headers: {
          origin: "null",
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-threadlens-api-token",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("null");
      expect(response.headers["access-control-allow-headers"]).toContain(
        "x-threadlens-api-token",
      );
    } finally {
      await app.close();
    }
  });

  it("allows packaged Electron Origin null GET responses for token-authenticated requests", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "secret-token");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/recovery-backup-export/download?token=00000000-0000-4000-8000-000000000000",
        headers: {
          origin: "null",
          "x-threadlens-api-token": "secret-token",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers["access-control-allow-origin"]).toBe("null");
      expect(response.json()).toMatchObject({
        ok: false,
        error: "recovery-backup-export-download-not-found",
      });
    } finally {
      await app.close();
    }
  });

  it("rejects packaged Electron Origin null preflight when desktop API auth is off", async () => {
    vi.stubEnv("THREADLENS_API_TOKEN", "");
    const app = await createServer();
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/recovery-backup-export/download?token=00000000-0000-4000-8000-000000000000",
        headers: {
          origin: "null",
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-threadlens-api-token",
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
