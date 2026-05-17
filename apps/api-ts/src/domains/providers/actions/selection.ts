import path from "node:path";
import { createHash } from "node:crypto";
import type {
  ProviderId,
  ProviderSessionAction,
  ProviderSessionActionOptions,
} from "../types.js";

export type NormalizedProviderActionOptions = {
  backup_before_delete: boolean;
  backup_root: string;
};

export function normalizeProviderActionPaths(filePaths: string[]): string[] {
  return Array.from(
    new Set(
      filePaths
        .map((item) => path.resolve(String(item || "").trim()))
        .filter(Boolean),
    ),
  ).sort();
}

export function normalizeProviderActionOptions(
  options?: ProviderSessionActionOptions,
): NormalizedProviderActionOptions {
  return {
    backup_before_delete: Boolean(options?.backup_before_delete),
    backup_root: String(options?.backup_root ?? "").trim(),
  };
}

export function buildProviderActionToken(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  const digest = buildProviderActionFingerprint(provider, action, filePaths, options);
  return `PROVIDER-${digest}`;
}

export function buildProviderActionFingerprint(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  const normalizedOptions = normalizeProviderActionOptions(options);
  const normalized = normalizeProviderActionPaths(filePaths);
  const raw = JSON.stringify({
    provider,
    action,
    paths: normalized,
    backup_before_delete: normalizedOptions.backup_before_delete,
    backup_root: normalizedOptions.backup_root,
  });
  return createHash("sha256")
    .update(raw, "utf-8")
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}
