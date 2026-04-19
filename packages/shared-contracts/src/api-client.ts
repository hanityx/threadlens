import type { ApiEnvelope } from "./index.js";

type MaybePromise<T> = T | Promise<T>;

type ApiClientErrorMode = "detailed" | "simple";

type ApiClientOptions = {
  resolveBaseUrl: () => MaybePromise<string>;
  unwrapEnvelope?: boolean;
  errorMode?: ApiClientErrorMode;
};

function formatApiError(
  path: string,
  status: number,
  detail: string,
  errorMode: ApiClientErrorMode,
): Error {
  const normalizedDetail = detail.trim();
  if (errorMode === "simple") {
    return new Error(normalizedDetail || `${path} failed with status ${status}`);
  }
  return new Error(
    normalizedDetail ? `${path} status ${status}: ${normalizedDetail}` : `${path} status ${status}`,
  );
}

function isEnvelopeLike<T>(payload: unknown): payload is ApiEnvelope<T> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      typeof (payload as { ok?: unknown }).ok === "boolean" &&
      "data" in payload,
  );
}

async function parseJsonPayload(response: Response, path: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }
}

export async function parseApiPayload<T>(
  response: Response,
  path: string,
  options: Pick<ApiClientOptions, "unwrapEnvelope" | "errorMode"> = {},
): Promise<T> {
  const errorMode = options.errorMode ?? "detailed";

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const detail = (await response.text()).trim();
      throw formatApiError(path, response.status, detail, errorMode);
    }

    const payload = await parseJsonPayload(response, path);
    const detail =
      payload && typeof payload === "object"
        ? String((payload as { error?: unknown; message?: unknown }).error ?? (payload as { message?: unknown }).message ?? "")
        : "";
    throw formatApiError(path, response.status, detail, errorMode);
  }

  const payload = await parseJsonPayload(response, path);

  if (options.unwrapEnvelope && isEnvelopeLike<T>(payload)) {
    if (!payload.ok || payload.data == null) {
      throw new Error(payload.error || `${path} failed`);
    }
    return payload.data;
  }

  return payload as T;
}

export function createApiClient(options: ApiClientOptions) {
  const unwrapEnvelope = options.unwrapEnvelope ?? false;
  const errorMode = options.errorMode ?? "detailed";

  async function buildApiUrl(path: string): Promise<string> {
    const apiBaseUrl = await options.resolveBaseUrl();
    return `${apiBaseUrl}${path}`;
  }

  async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(await buildApiUrl(path), init);
    return parseApiPayload<T>(response, path, { unwrapEnvelope, errorMode });
  }

  async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(await buildApiUrl(path), {
      ...init,
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return parseApiPayload<T>(response, path, { unwrapEnvelope, errorMode });
  }

  async function apiPostJsonAllowError<T>(
    path: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(await buildApiUrl(path), {
      ...init,
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = (await parseJsonPayload(response, path)) as T;
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  return {
    buildApiUrl,
    apiGet,
    apiPost,
    apiPostJsonAllowError,
  };
}
