import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { RECOVERY_CHECKLIST_FILE } from "./constants.js";
import { isRecord, readJsonFile } from "./utils.js";

export type RecoveryChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

function defaultRecoveryChecklist(): RecoveryChecklistItem[] {
  return [
    { id: "backup_exists", label: "Confirm the latest backup set exists", done: false },
    { id: "dry_run_ok", label: "Review the cleanup dry-run result", done: false },
    { id: "token_verified", label: "Verify the execution token", done: false },
    { id: "drill_run", label: "Run and review the recovery drill", done: false },
    { id: "post_verify", label: "Verify state after execution", done: false },
  ];
}

export async function loadRecoveryChecklist(): Promise<RecoveryChecklistItem[]> {
  const data = await readJsonFile(RECOVERY_CHECKLIST_FILE);
  if (isRecord(data) && Array.isArray(data.items)) {
    return data.items
      .filter((item) => isRecord(item))
      .map((item) => ({
        id: String(item.id ?? ""),
        label: String(item.label ?? ""),
        done: Boolean(item.done),
      }))
      .filter((item) => item.id && item.label);
  }
  const defaults = defaultRecoveryChecklist();
  await saveRecoveryChecklist(defaults);
  return defaults;
}

async function saveRecoveryChecklist(items: RecoveryChecklistItem[]) {
  await mkdir(path.dirname(RECOVERY_CHECKLIST_FILE), { recursive: true });
  await writeFile(
    RECOVERY_CHECKLIST_FILE,
    JSON.stringify({ items }, null, 2),
    "utf-8",
  );
}

export async function updateRecoveryChecklistItem(
  itemId: string,
  done: boolean,
) {
  const id = String(itemId ?? "").trim();
  if (!id) return { ok: false, error: "item_id is required" };
  const items = await loadRecoveryChecklist();
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return { ...item, done: Boolean(done) };
  });
  if (!changed) return { ok: false, error: "checklist item not found" };
  await saveRecoveryChecklist(next);
  return { ok: true, items: next };
}
