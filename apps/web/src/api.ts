import { createApiClient } from "@threadlens/shared-contracts";

async function resolveApiBaseUrl(): Promise<string> {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== "undefined") {
    const runtimeBase = await window.threadLensDesktop?.getApiBaseUrl?.();
    if (runtimeBase) return runtimeBase;
  }
  return import.meta.env.DEV ? "" : "http://127.0.0.1:8788";
}

const client = createApiClient({
  resolveBaseUrl: resolveApiBaseUrl,
  unwrapEnvelope: false,
  errorMode: "detailed",
});

export const buildApiUrl = client.buildApiUrl;
export const apiGet = client.apiGet;
export const apiPost = client.apiPost;
export const apiPostJsonAllowError = client.apiPostJsonAllowError;
