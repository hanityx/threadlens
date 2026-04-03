import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { UpdateCheckStatus } from "@threadlens/shared-contracts";

type UpdateDismissState = {
  dismissed_version?: string;
};

export function resolveUpdateDismissStatePath() {
  const stateRoot = process.env.THREADLENS_TUI_STATE_DIR?.trim()
    || path.join(os.homedir(), ".threadlens", "tui");
  return path.join(stateRoot, "update-notice.json");
}

export function readDismissedUpdateVersion(statePath = resolveUpdateDismissStatePath()) {
  try {
    if (!existsSync(statePath)) return "";
    const raw = readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as UpdateDismissState;
    return typeof parsed.dismissed_version === "string" ? parsed.dismissed_version : "";
  } catch {
    return "";
  }
}

export function persistDismissedUpdateVersion(
  version: string,
  statePath = resolveUpdateDismissStatePath(),
) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify({ dismissed_version: version }, null, 2),
    "utf8",
  );
}

export function shouldDisplayUpdateNotice(
  updateCheck: Pick<UpdateCheckStatus, "has_update" | "latest_version"> | null,
  dismissedVersion: string,
) {
  if (!updateCheck?.has_update) return false;
  return updateCheck.latest_version !== dismissedVersion;
}
