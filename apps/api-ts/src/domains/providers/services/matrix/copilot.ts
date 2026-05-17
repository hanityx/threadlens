import path from "node:path";

import {
  walkFilesByExt,
} from "../../../../lib/utils.js";
import {
  isCopilotGlobalSessionLikeFile,
  isWorkspaceChatSessionPath,
} from "../../probe.js";
import type {
  ProviderRootSpec,
} from "../../types.js";

const COPILOT_MATRIX_SESSION_SCAN_LIMIT = 5_000;

function shouldIncludeCopilotMatrixSessionFile(source: string, filePath: string): boolean {
  if (source === "cleanup_backups" && path.basename(filePath) === "_manifest.json") {
    return false;
  }
  if (source === "vscode_workspace_chats" || source === "cursor_workspace_chats") {
    return isWorkspaceChatSessionPath(filePath);
  }
  if (source === "vscode_global" || source === "cursor_global") {
    return isCopilotGlobalSessionLikeFile(filePath);
  }
  return true;
}

export async function countCopilotMatrixSessionFiles(
  roots: ProviderRootSpec[],
): Promise<number> {
  const counts = await Promise.all(
    roots.map(async (spec) => {
      const files = await walkFilesByExt(
        spec.root,
        spec.exts,
        COPILOT_MATRIX_SESSION_SCAN_LIMIT,
      );
      return files.filter((filePath) =>
        shouldIncludeCopilotMatrixSessionFile(spec.source, filePath),
      ).length;
    }),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}
