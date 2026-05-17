import { randomUUID } from "node:crypto";
import {
  normalizeProviderActionOptions,
  normalizeProviderActionPaths,
} from "./selection.js";
import type {
  ProviderId,
  ProviderSessionAction,
  ProviderSessionActionOptions,
} from "../types.js";

type ProviderActionTokenEntry = {
  provider: ProviderId;
  action: ProviderSessionAction;
  paths: string[];
  backup_before_delete: boolean;
  backup_root: string;
  expires_at: number;
};

const PROVIDER_ACTION_TOKEN_TTL_MS = 10 * 60_000;
const providerActionTokenCache = new Map<string, ProviderActionTokenEntry>();

export function pruneProviderActionTokens(now = Date.now()) {
  for (const [token, entry] of providerActionTokenCache.entries()) {
    if (entry.expires_at <= now) providerActionTokenCache.delete(token);
  }
}

export function issueProviderActionConfirmToken(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  const normalized = normalizeProviderActionPaths(filePaths);
  const normalizedOptions = normalizeProviderActionOptions(options);
  const token = `PROVIDER-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  providerActionTokenCache.set(token, {
    provider,
    action,
    paths: normalized,
    backup_before_delete: normalizedOptions.backup_before_delete,
    backup_root: normalizedOptions.backup_root,
    expires_at: Date.now() + PROVIDER_ACTION_TOKEN_TTL_MS,
  });
  return token;
}

export function consumeProviderActionConfirmToken(
  token: string,
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): { ok: boolean; reason: string } {
  pruneProviderActionTokens();
  const normalizedOptions = normalizeProviderActionOptions(options);
  const key = String(token || "").trim();
  if (!key) return { ok: false, reason: "missing-confirm-token" };
  const entry = providerActionTokenCache.get(key);
  if (!entry) return { ok: false, reason: "invalid-confirm-token" };
  if (entry.expires_at <= Date.now()) {
    providerActionTokenCache.delete(key);
    return { ok: false, reason: "expired-confirm-token" };
  }
  const normalized = normalizeProviderActionPaths(filePaths);
  const sameProvider = entry.provider === provider;
  const sameAction = entry.action === action;
  const sameOptions =
    entry.backup_before_delete === normalizedOptions.backup_before_delete &&
    entry.backup_root === normalizedOptions.backup_root;
  const samePaths =
    entry.paths.length === normalized.length &&
    entry.paths.every((item, idx) => item === normalized[idx]);
  if (!sameProvider || !sameAction || !sameOptions || !samePaths) {
    return { ok: false, reason: "confirm-token-scope-mismatch" };
  }
  providerActionTokenCache.delete(key);
  return { ok: true, reason: "" };
}
