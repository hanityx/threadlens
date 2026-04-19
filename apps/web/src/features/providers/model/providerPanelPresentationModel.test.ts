import { describe, expect, it } from "vitest";
import { getMessages, type Messages } from "@/i18n";
import type { ProviderSessionActionResult } from "@/shared/types";
import {
  buildProviderSessionActionSummary,
  buildProviderPanelPresentationModel,
  getProviderWorkflowStage,
  getCapabilityLevelLabel,
  getProviderActionLabel,
  getProviderFlowStateLabel,
  getProviderStatusLabel,
} from "@/features/providers/model/providerPanelPresentationModel";

const messages = getMessages("en");

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

const previewDeleteResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "delete_local",
  dry_run: true,
  target_count: 1,
  valid_count: 1,
  applied_count: 0,
  confirm_token_expected: "tok-1",
  confirm_token_accepted: false,
  backed_up_count: 1,
  backup_before_delete: true,
};

const previewArchiveResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "archive_local",
  dry_run: true,
  target_count: 1,
  valid_count: 1,
  applied_count: 0,
  confirm_token_expected: "tok-archive",
  confirm_token_accepted: false,
};

describe("providerPanelPresentationModel", () => {
  it("maps status, action, flow, and capability labels", () => {
    expect(getProviderStatusLabel(messages, "active")).toBe("Active");
    expect(getProviderActionLabel(messages, "archive_local")).toBe("Archive locally");
    expect(getProviderFlowStateLabel(messages, "blocked")).toBe("Blocked");
    expect(getCapabilityLevelLabel("read-only")).toBe("Read only");
  });

  it("builds action summary copy for preview-ready results", () => {
    const summary = buildProviderSessionActionSummary(messages, previewDeleteResult);

    expect(summary).not.toBeNull();
    if (!summary) {
      throw new Error("expected preview summary");
    }
    expect(summary.headline).toBe("Delete locally · Preview ready");
    expect(summary.detail).toBe("Preview ready. Execute from this card when it looks right.");
    expect(summary.token).toBe("tok-1");
    expect(summary.previewReady).toBe(true);
  });

  it("returns pending workflow stage when current selection no longer matches the preview scope", () => {
    const stage = getProviderWorkflowStage(messages, {
      action: "delete_local",
      actionResult: previewDeleteResult,
      actionSelection: {
        provider: "codex",
        action: "delete_local",
        file_paths: ["/tmp/session-1.jsonl"],
        dry_run: true,
        backup_before_delete: true,
      },
      currentSelectionKey: "",
    });

    expect(stage).toEqual({
      label: "Pending",
      className: "status-preview",
    });
  });

  it("returns ready workflow stage only when the current selection still matches the preview scope", () => {
    const stage = getProviderWorkflowStage(messages, {
      action: "archive_local",
      actionResult: previewArchiveResult,
      actionSelection: {
        provider: "codex",
        action: "archive_local",
        file_paths: ["/tmp/session-1.jsonl"],
        dry_run: true,
      },
      currentSelectionKey: "codex|archive_local|direct|/tmp/session-1.jsonl",
    });

    expect(stage).toEqual({
      label: "Ready",
      className: "status-active",
    });
  });

  it("builds backup summary state for a selected provider", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: backupActionResult,
      recoveryBackupExportData: { ok: true, exported_count: 4 },
      selectedProviderFilePathsCount: 2,
      providerActionProvider: "codex",
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
      providerActionProvider: "",
      providerDeleteBackupEnabled: false,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("All Providers");
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

  it("allows backup controls in all-provider view when selected rows resolve to one provider", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "all",
      selectedProviderLabel: "All Providers",
      providerActionData: null,
      recoveryBackupExportData: null,
      selectedProviderFilePathsCount: 1,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.canRunProviderBackup).toBe(true);
    expect(model.providerLabel).toBe("All Providers");
  });

  it("localizes backup hints and toggle labels for Korean all-provider view", () => {
    const koMessages = getMessages("ko");
    const model = buildProviderPanelPresentationModel({
      messages: koMessages,
      providerView: "all",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryBackupExportData: null,
      selectedProviderFilePathsCount: 2,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("All Providers");
    expect(model.latestBackupPath).toBe("이 세션에서 선택한 백업이 아직 없습니다.");
    expect(model.backupFlowHint).toBe(
      "선택한 세션 2개를 먼저 백업한 뒤, 아래에서 아카이브나 삭제 미리 실행을 진행합니다.",
    );
    expect(model.deleteBackupModeLabel).toBe("켜짐");
  });
});
