import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  type ProviderId,
} from "@threadlens/shared-contracts";
import {
  CHAT_DIR,
  CODEX_HOME,
} from "../../lib/constants.js";
import {
  providerRootSpecs,
  providerScanRootSpecs,
} from "./provider-roots.js";

export {
  codexTranscriptSearchRoots,
  providerRootSpecs,
  providerScanRootSpecs,
} from "./provider-roots.js";

export function providerName(provider: ProviderId): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export function listProviderIds(): ProviderId[] {
  return [...PROVIDER_IDS];
}

export function parseProviderId(raw: unknown): ProviderId | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((PROVIDER_IDS as readonly string[]).includes(value)) {
    return value as ProviderId;
  }
  return undefined;
}

export function isPathInsideRoot(
  targetPath: string,
  rootPath: string,
): boolean {
  const fullTarget = path.resolve(targetPath);
  const fullRoot = path.resolve(rootPath);
  return (
    fullTarget === fullRoot || fullTarget.startsWith(`${fullRoot}${path.sep}`)
  );
}

function isCodexCwdBackupPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".jsonl") return false;
  if (!isPathInsideRoot(filePath, CODEX_HOME)) return false;
  const relativePath = path.relative(CODEX_HOME, path.resolve(filePath));
  const [firstSegment = ""] = relativePath.split(path.sep);
  return (
    firstSegment.startsWith("jsonl-cwd-backups-") &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".."
  );
}

export function isAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): boolean {
  if (provider === "codex" && isCodexCwdBackupPath(filePath)) {
    return true;
  }
  if (provider === "chatgpt") {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".data") return false;
    if (!isPathInsideRoot(filePath, CHAT_DIR)) return false;
    const normalized = path.resolve(filePath);
    return /(^|[\\/])conversations-v3-[^\\/]+[\\/]/.test(normalized);
  }
  const specs = providerRootSpecs(provider);
  const ext = path.extname(filePath).toLowerCase();
  return specs.some(
    (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
  );
}

export async function resolveSafePathWithinRoots(
  filePath: string,
  rootPaths: string[],
): Promise<string | null> {
  const normalizedTarget = path.resolve(filePath);
  let targetLstat;
  try {
    targetLstat = await lstat(normalizedTarget);
  } catch {
    return null;
  }
  if (targetLstat.isSymbolicLink()) return null;

  let realTarget = "";
  try {
    realTarget = await realpath(normalizedTarget);
  } catch {
    return null;
  }

  for (const rootPath of rootPaths) {
    try {
      const realRoot = await realpath(rootPath);
      if (
        realTarget === realRoot ||
        realTarget.startsWith(`${realRoot}${path.sep}`)
      ) {
        return realTarget;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolveAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  if (!isAllowedProviderFilePath(provider, filePath)) return null;
  const specs = await providerScanRootSpecs(provider);
  const ext = path.extname(filePath).toLowerCase();
  const matchingRoots = specs
    .filter(
      (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
    )
    .map((spec) => spec.root);

  if (!matchingRoots.length) return null;
  return resolveSafePathWithinRoots(filePath, matchingRoots);
}
