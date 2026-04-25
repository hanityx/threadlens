import { createApiClient } from "@threadlens/shared-contracts";

export async function resolveApiBaseUrlFromRuntime(options: {
  envBaseUrl?: string;
  isDev: boolean;
  runtimeWindow?: Window;
}): Promise<string> {
  if (options.envBaseUrl) return options.envBaseUrl;
  if (options.runtimeWindow?.threadLensDesktop?.getApiBaseUrl) {
    try {
      const runtimeBase = await options.runtimeWindow.threadLensDesktop.getApiBaseUrl();
      if (runtimeBase) return runtimeBase;
    } catch {
      // Fall back to the default desktop API origin when the bridge is temporarily unavailable.
    }
  }
  return options.isDev ? "" : "http://127.0.0.1:8788";
}

export async function resolveApiAuthTokenFromRuntime(options: {
  envToken?: string;
  runtimeWindow?: Window;
}): Promise<string> {
  if (options.envToken) return options.envToken;
  if (options.runtimeWindow?.threadLensDesktop?.getApiAuthToken) {
    try {
      return (await options.runtimeWindow.threadLensDesktop.getApiAuthToken()) || "";
    } catch {
      // Desktop packaged APIs enforce tokens; browser/dev mode keeps working without one.
    }
  }
  return "";
}

async function resolveApiBaseUrl(): Promise<string> {
  return resolveApiBaseUrlFromRuntime({
    envBaseUrl: import.meta.env.VITE_API_BASE_URL,
    isDev: import.meta.env.DEV,
    runtimeWindow: typeof window !== "undefined" ? window : undefined,
  });
}

async function resolveApiAuthToken(): Promise<string> {
  return resolveApiAuthTokenFromRuntime({
    envToken: import.meta.env.VITE_API_AUTH_TOKEN,
    runtimeWindow: typeof window !== "undefined" ? window : undefined,
  });
}

const client = createApiClient({
  resolveBaseUrl: resolveApiBaseUrl,
  resolveAuthToken: resolveApiAuthToken,
  unwrapEnvelope: false,
  errorMode: "detailed",
});

export const buildApiUrl = client.buildApiUrl;
export const apiGet = client.apiGet;
export const apiPost = client.apiPost;
export const apiPostJsonAllowError = client.apiPostJsonAllowError;
