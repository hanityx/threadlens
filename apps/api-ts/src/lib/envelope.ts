import {
  ApiEnvelope,
  SCHEMA_VERSION,
} from "@threadlens/shared-contracts";

export function envelope<T>(
  data: T | null,
  error: string | null = null,
): ApiEnvelope<T> {
  return {
    ok: !error,
    schema_version: SCHEMA_VERSION,
    data,
    error,
  };
}

export function withSchemaVersion(payload: unknown): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (!record.schema_version) {
      return { ...record, schema_version: SCHEMA_VERSION };
    }
    return payload;
  }
  return envelope(payload, null);
}
