const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "" : "http://127.0.0.1:8788");

async function buildApiError(path: string, res: Response): Promise<Error> {
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await res.json()) as { error?: unknown; message?: unknown };
      const detail = String(payload.error ?? payload.message ?? "").trim();
      if (detail) return new Error(`${path} status ${res.status}: ${detail}`);
    } else {
      const rawText = (await res.text()).trim();
      if (rawText) return new Error(`${path} status ${res.status}: ${rawText}`);
    }
  } catch {
    // ignore parse errors and fall back to status only
  }
  return new Error(`${path} status ${res.status}`);
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) throw await buildApiError(path, res);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await buildApiError(path, res);
  return res.json() as Promise<T>;
}
