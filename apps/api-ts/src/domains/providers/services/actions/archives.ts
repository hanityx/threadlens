import path from "node:path";
import { realpath } from "node:fs/promises";
import { isPathInsideRoot, providerRootSpecs } from "../../path-safety.js";
import type { ProviderId, ProviderRootSpec } from "../../types.js";

function isSafeProviderRelativePath(relativePath: string): boolean {
  return Boolean(relativePath) &&
    relativePath !== "." &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath);
}

async function relativePathWithinProviderRoot(
  filePath: string,
  spec: ProviderRootSpec,
): Promise<string | null> {
  const resolvedPath = path.resolve(filePath);
  if (isPathInsideRoot(resolvedPath, spec.root)) {
    const relativePath = path.relative(spec.root, resolvedPath);
    return isSafeProviderRelativePath(relativePath) ? relativePath : null;
  }

  try {
    const [realTarget, realRoot] = await Promise.all([
      realpath(resolvedPath),
      realpath(spec.root),
    ]);
    if (isPathInsideRoot(realTarget, realRoot)) {
      const relativePath = path.relative(realRoot, realTarget);
      return isSafeProviderRelativePath(relativePath) ? relativePath : null;
    }
  } catch {
    // Fall back to the resolved path comparison above when a root cannot be realpathed.
  }

  return null;
}

export async function resolveArchivedSessionRestoreTarget(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  const specs = providerRootSpecs(provider);
  const archivedSpecs = specs
    .filter((spec) => spec.source === "archived_sessions")
    .sort((left, right) => right.root.length - left.root.length);
  const sessionsSpec = specs.find((spec) => spec.source === "sessions");
  let relativePath: string | null = null;
  for (const spec of archivedSpecs) {
    relativePath = await relativePathWithinProviderRoot(filePath, spec);
    if (relativePath) break;
  }
  if (!relativePath) return null;

  if (sessionsSpec && !relativePath.includes(path.sep)) {
    return path.join(sessionsSpec.root, relativePath);
  }
  const [sourceName = "", ...sourceRelativeParts] = relativePath.split(path.sep);
  const sourceRelativePath = sourceRelativeParts.join(path.sep);
  const sourceSpec = specs.find(
    (spec) =>
      spec.source === sourceName &&
      spec.source !== "cleanup_backups" &&
      spec.source !== "archived_sessions",
  );
  if (sourceSpec && sourceRelativePath) {
    return path.join(sourceSpec.root, sourceRelativePath);
  }
  if (sessionsSpec) {
    return path.join(sessionsSpec.root, relativePath);
  }
  return null;
}

export async function resolveArchivedSessionStoreTarget(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  const resolvedPath = path.resolve(filePath);
  const specs = providerRootSpecs(provider);
  const archivedSpec = specs.find((spec) => spec.source === "archived_sessions");
  if (!archivedSpec) return null;
  const sourceSpecs = specs
    .filter(
      (spec) =>
        spec.source !== "cleanup_backups" &&
        spec.source !== "archived_sessions" &&
        spec.exts.includes(path.extname(resolvedPath).toLowerCase()),
    )
    .sort((left, right) => right.root.length - left.root.length);
  let sourceSpec: ProviderRootSpec | null = null;
  let relativePath: string | null = null;
  for (const spec of sourceSpecs) {
    relativePath = await relativePathWithinProviderRoot(resolvedPath, spec);
    if (relativePath) {
      sourceSpec = spec;
      break;
    }
  }
  if (!sourceSpec || !relativePath) return null;

  const archiveRelativePath =
    provider === "codex" && sourceSpec.source === "sessions"
      ? relativePath
      : path.join(sourceSpec.source, relativePath);
  return path.join(archivedSpec.root, archiveRelativePath);
}

export function resolveArchivedSessionRoot(provider: ProviderId): string | null {
  return providerRootSpecs(provider).find((spec) => spec.source === "archived_sessions")
    ?.root ?? null;
}
