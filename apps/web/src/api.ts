const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8788";

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) throw new Error(`${path} status ${res.status}`);
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
  if (!res.ok) throw new Error(`${path} status ${res.status}`);
  return res.json() as Promise<T>;
}
