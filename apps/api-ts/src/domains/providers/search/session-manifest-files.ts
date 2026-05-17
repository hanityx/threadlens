import { stat } from "node:fs/promises";
import path from "node:path";

import {
  normalizeSearchText,
} from "../search-helpers.js";
import {
  isCopilotGlobalSessionLikeFile,
  isWorkspaceChatSessionPath,
} from "../probe.js";
import type {
  ProviderId,
  ProviderRootSpec,
} from "../types.js";
import {
  walkFilesByExt,
} from "../../../lib/utils.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  PROVIDER_SCAN_FILE_STAT_CONCURRENCY,
  PROVIDER_SESSION_MANIFEST_FILE_LIMIT,
} from "./constants.js";
import {
  mapWithConcurrency,
} from "./concurrency.js";
import type {
  ProviderSessionCandidate,
} from "./types.js";

export function providerSessionSourcePriority(source: string): number {
  const normalized = normalizeSearchText(source).toLowerCase();
  if (normalized === "sessions") return 500;
  if (normalized === "projects") return 480;
  if (normalized === "transcripts") return 470;
  if (normalized === "history") return 460;
  if (normalized === "tmp") return 450;
  if (normalized.includes("workspace")) return 440;
  if (normalized.includes("global")) return 430;
  if (normalized.includes("cleanup_backups")) return 100;
  return 300;
}

function shouldIncludeProviderSessionFile(
  provider: ProviderId,
  source: string,
  filePath: string,
): boolean {
  const baseName = path.basename(filePath);
  if (source === "cleanup_backups" && baseName === "_manifest.json") {
    return false;
  }
  if (
    provider === "copilot" &&
    (source === "vscode_workspace_chats" || source === "cursor_workspace_chats")
  ) {
    return isWorkspaceChatSessionPath(filePath);
  }
  if (
    provider === "copilot" &&
    (source === "vscode_global" || source === "cursor_global")
  ) {
    return isCopilotGlobalSessionLikeFile(filePath);
  }
  return true;
}

async function walkRootExists(root: string): Promise<boolean> {
  try {
    await stat(root);
    return true;
  } catch {
    return false;
  }
}

export async function providerSessionRootExists(
  provider: ProviderId,
  roots: ProviderRootSpec[],
): Promise<boolean> {
  return provider === "chatgpt"
    ? roots.length > 0
    : (await Promise.all(roots.map((r) => walkRootExists(r.root)))).some(Boolean);
}

export async function collectProviderSessionCandidates(
  provider: ProviderId,
  roots: ProviderRootSpec[],
  options?: { signal?: AbortSignal },
): Promise<ProviderSessionCandidate[]> {
  const candidates: ProviderSessionCandidate[] = [];

  const rootFiles = await Promise.all(
    roots.map((spec) => {
      throwIfAborted(options?.signal);
      return walkFilesByExt(spec.root, spec.exts, PROVIDER_SESSION_MANIFEST_FILE_LIMIT);
    }),
  );

  for (let i = 0; i < roots.length; i += 1) {
    throwIfAborted(options?.signal);
    const spec = roots[i];
    const files = rootFiles[i] ?? [];
    const filteredFiles = files.filter((filePath) =>
      shouldIncludeProviderSessionFile(provider, spec.source, filePath),
    );

    const scannedCandidates = await mapWithConcurrency(
      filteredFiles,
      PROVIDER_SCAN_FILE_STAT_CONCURRENCY,
      async (file) => {
        try {
          throwIfAborted(options?.signal);
          const st = await stat(file);
          throwIfAborted(options?.signal);
          return {
            source: spec.source,
            file_path: file,
            size_bytes: Number(st.size),
            mtime: new Date(Number(st.mtimeMs)).toISOString(),
            mtime_ms: Number(st.mtimeMs),
          };
        } catch {
          return null;
        }
      },
    );
    candidates.push(
      ...scannedCandidates.filter(
        (
          candidate,
        ): candidate is {
          source: string;
          file_path: string;
          size_bytes: number;
          mtime: string;
          mtime_ms: number;
        } => Boolean(candidate),
      ),
    );
  }

  candidates.sort((a, b) => b.mtime_ms - a.mtime_ms);
  return candidates;
}
