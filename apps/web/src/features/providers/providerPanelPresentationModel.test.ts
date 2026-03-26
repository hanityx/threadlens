import { describe, expect, it } from "vitest";
import type { Messages } from "../../i18n";
import type { ProviderSessionActionResult } from "../../types";
import {
  buildProviderPanelPresentationModel,
  getCapabilityLevelLabel,
  getProviderActionLabel,
  getProviderFlowStateLabel,
  getProviderStatusLabel,
} from "./providerPanelPresentationModel";

const messages = {
  common: {
    allAi: "All AI",
  },
  providers: {
    statusActive: "Active",
    statusDetected: "Detected",
    statusMissing: "Missing",
    actionBackupLocal: "Backup local",
    actionArchiveLocal: "Archive local",
    actionDeleteLocal: "Delete local",
    flowStatusDone: "Done",
    flowStatusBlocked: "Blocked",
    flowStatusPending: "Pending",
  },
} as unknown as Messages;

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

describe("providerPanelPresentationModel", () => {
  it("maps status, action, flow, and capability labels", () => {
    expect(getProviderStatusLabel(messages, "active")).toBe("Active");
    expect(getProviderActionLabel(messages, "archive_local")).toBe("Archive local");
    expect(getProviderFlowStateLabel(messages, "blocked")).toBe("Blocked");
    expect(getCapabilityLevelLabel("read-only")).toBe("Read only");
  });

  it("builds backup summary state for a selected provider", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: backupActionResult,
      recoveryBackupExportData: { ok: true, exported_count: 4 },
      selectedProviderFilePathsCount: 2,
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: "all",
      slowOnly: true,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("Codex");
    expect(model.latestBackupCount).toBe(2);
    expect(model.latestBackupPath).toBe("/tmp/backups/latest");
    expect(model.latestExportCount).toBe(4);
    expect(model.backupFlowHint).toBe(
      "Back up 2 selected sessions first, then run archive or delete dry-runs below.",
    );
    expect(model.deleteBackupModeLabel).toBe("On");
    expect(model.canRunProviderBackup).toBe(true);
    expect(model.canReturnHotspotScope).toBe(true);
    expect(model.slowFocusActive).toBe(true);
    expect(model.showProviderColumn).toBe(false);
  });

  it("falls back for all-provider view with no backup run", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "all",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryBackupExportData: null,
      selectedProviderFilePathsCount: 0,
      providerDeleteBackupEnabled: false,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("All AI");
    expect(model.latestBackupCount).toBe(0);
    expect(model.latestBackupPath).toBe("No selected backup created in this session yet.");
    expect(model.latestExportCount).toBe(0);
    expect(model.backupFlowHint).toBe("Pick sessions first, then start with backup.");
    expect(model.deleteBackupModeLabel).toBe("Off");
    expect(model.canRunProviderBackup).toBe(false);
    expect(model.canReturnHotspotScope).toBe(false);
    expect(model.slowFocusActive).toBe(false);
    expect(model.showProviderColumn).toBe(true);
  });
});
