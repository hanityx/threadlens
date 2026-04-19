import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages, type Messages } from "@/i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "@/shared/types";
import { BackupHub } from "@/features/providers/components/BackupHub";

const messages = getMessages("en");

const selectedSessionPreview: ProviderSessionRow = {
  provider: "codex",
  source: "history",
  session_id: "sess-12345678",
  display_title: "Open Codex Cleanup",
  file_path: "/tmp/sess.jsonl",
  size_bytes: 123,
  mtime: "2026-03-24T00:00:00.000Z",
  probe: {
    ok: true,
    format: "jsonl",
    error: null,
    detected_title: "Open Codex Cleanup",
    title_source: "header",
  },
};

const backupActionResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "backup_local",
  dry_run: false,
  target_count: 2,
  valid_count: 2,
  applied_count: 2,
  confirm_token_expected: "",
  confirm_token_accepted: true,
  backed_up_count: 2,
  backup_to: "/tmp/backups/latest",
  backup_manifest_path: "/tmp/backups/latest/manifest.json",
};

describe("BackupHub", () => {
  it("renders backup counts, preview, and latest run summary", () => {
    const onProviderDeleteBackupEnabledChange = vi.fn();
    const onRunBackupSelected = vi.fn();
    const onRunRecoveryBackupExport = vi.fn();

    const html = renderToStaticMarkup(
      <BackupHub
        messages={messages}
        selectedProviderFilePathsCount={2}
        latestBackupCount={2}
        latestExportCount={5}
        providerDeleteBackupEnabled
        onProviderDeleteBackupEnabledChange={onProviderDeleteBackupEnabledChange}
        canRunProviderBackup
        busy={false}
        onRunBackupSelected={onRunBackupSelected}
        onRunRecoveryBackupExport={onRunRecoveryBackupExport}
        latestBackupPath="/tmp/backups/latest"
        backupFlowHint="Pick sessions first."
        deleteBackupModeLabel="On"
        selectedSessionPreview={selectedSessionPreview}
        backupActionResult={backupActionResult}
      />,
    );

    expect(html).toContain("Selected sessions 2");
    expect(html).toContain("Full backup export");
    expect(html).toContain("Open Codex Cleanup");
    expect(html).toContain("sess-12345678 · codex · jsonl");
    expect(html).toContain("Latest backup run");
    expect(html).toContain("Valid 2 · Applied 2 · Backed up 2");
    expect(onProviderDeleteBackupEnabledChange).not.toHaveBeenCalled();
    expect(onRunBackupSelected).not.toHaveBeenCalled();
    expect(onRunRecoveryBackupExport).not.toHaveBeenCalled();
  });

  it("renders fallback hint when no backup has run yet", () => {
    const html = renderToStaticMarkup(
      <BackupHub
        messages={messages}
        selectedProviderFilePathsCount={0}
        latestBackupCount={0}
        latestExportCount={0}
        providerDeleteBackupEnabled={false}
        onProviderDeleteBackupEnabledChange={() => undefined}
        canRunProviderBackup={false}
        busy={false}
        onRunBackupSelected={() => undefined}
        onRunRecoveryBackupExport={() => undefined}
        latestBackupPath="No selected backup created in this session yet."
        backupFlowHint="Pick sessions first."
        deleteBackupModeLabel="Off"
        selectedSessionPreview={null}
        backupActionResult={null}
      />,
    );

    expect(html).toContain("Back up before delete");
    expect(html).toContain("Pick sessions first.");
  });

  it("renders localized backup copy", () => {
    const ptMessages = getMessages("pt-BR");
    const html = renderToStaticMarkup(
      <BackupHub
        messages={ptMessages}
        selectedProviderFilePathsCount={2}
        latestBackupCount={2}
        latestExportCount={5}
        providerDeleteBackupEnabled
        onProviderDeleteBackupEnabledChange={() => undefined}
        canRunProviderBackup
        busy={false}
        onRunBackupSelected={() => undefined}
        onRunRecoveryBackupExport={() => undefined}
        latestBackupPath="/tmp/backups/latest"
        backupFlowHint="Faça backup primeiro das 2 sessões selecionadas."
        deleteBackupModeLabel="Ligado"
        selectedSessionPreview={selectedSessionPreview}
        backupActionResult={backupActionResult}
      />,
    );

    expect(html).toContain(`${ptMessages.providers.backupHubSelected} 2 · ${ptMessages.providers.backupHubLatest} 2 · ${ptMessages.providers.backupHubExported} 5`);
    expect(html).toContain(ptMessages.providers.latestBackupRunTitle);
    expect(html).toContain(`${ptMessages.providers.valid} 2 · ${ptMessages.providers.applied} 2 · ${ptMessages.providers.backedUp} 2`);
    expect(html).toContain(`${ptMessages.providers.deleteWithBackup} Ligado`);
  });
});
