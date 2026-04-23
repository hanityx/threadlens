import { describe, expect, it } from "vitest";
import type { Messages } from "@/i18n";
import { getMessages } from "@/i18n/catalog";
import type { ProviderSessionActionResult } from "@/shared/types";
import { providerActionSelectionKey } from "@/shared/lib/appState";
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
const koMessages = getMessages("ko");

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
    expect(getCapabilityLevelLabel(messages, "full")).toBe("Full capability");
    expect(getCapabilityLevelLabel(koMessages, "read-only")).toBe("읽기 전용");
    expect(getCapabilityLevelLabel(koMessages, "unavailable")).toBe("사용 불가");
  });

  it("builds action summary copy for preview-ready results", () => {
    const summary = buildProviderSessionActionSummary(messages, previewDeleteResult);

    expect(summary).not.toBeNull();
    if (!summary) {
      throw new Error("expected preview summary");
    }
    expect(summary.headline).toBe("Delete locally · Prep ready");
    expect(summary.detail).toBe("Prepared. Review affected source files, then execute when ready.");
    expect(summary.token).toBe("");
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
      currentSelectionKey: providerActionSelectionKey("codex", "archive_local", ["/tmp/session-1.jsonl"]),
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
      recoveryData: {
        backup_root: "/tmp/backups",
        backup_total: 9,
        backup_sets: [
          {
            backup_id: "provider_actions/codex/latest",
            path: "/tmp/backups/provider_actions/codex/latest",
            file_count: 2,
            total_bytes: 512,
            latest_mtime: "2026-04-22T06:37:16.493Z",
          },
        ],
      },
      recoveryBackupExportData: { ok: true, exported_count: 4 },
      backupRoot: "/tmp/backups",
      exportRoot: "/tmp/exports",
      latestExportArchivePath: "/tmp/exports/latest-export.zip",
      selectedProviderFilePathsCount: 2,
      selectedBackupEligibleFilePathsCount: 2,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 0,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: "all",
      slowOnly: true,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("Codex");
    expect(model.availableBackupSets).toBe(1);
    expect(model.latestBackupPath).toBe("/tmp/backups/latest");
    expect(model.latestBackupFolder).toBe("/tmp/backups");
    expect(model.latestExportPath).toBe("/tmp/exports/latest-export.zip");
    expect(model.exportFolder).toBe("/tmp/exports");
    expect(model.deleteBackupModeLabel).toBe("On");
    expect(model.canRunProviderBackup).toBe(true);
    expect(model.canReturnHotspotScope).toBe(true);
    expect(model.slowFocusActive).toBe(true);
    expect(model.showProviderColumn).toBe(false);
  });

  it("drops stale export paths that do not belong to the current export folder", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: null,
      recoveryBackupExportData: {
        ok: true,
        exported_count: 1,
        export_root: "/tmp/current-exports",
      },
      backupRoot: "/tmp/backups",
      exportRoot: "/tmp/current-exports",
      latestExportArchivePath: "/tmp/other-exports/latest-export.zip",
      selectedProviderFilePathsCount: 1,
      selectedBackupEligibleFilePathsCount: 1,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 0,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.latestExportPath).toBe("No export yet.");
  });

  it("prefers the currently queried custom roots over default roots from recovery metadata", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: {
        default_backup_root: "~/Documents/ThreadLens/backups",
        default_export_root: "~/Downloads/ThreadLens/recovery-exports",
        backup_root: "/tmp/custom-backups",
        backup_total: 1,
        backup_sets: [
          {
            backup_id: "provider_actions/codex/latest",
            path: "/tmp/custom-backups/provider_actions/codex/latest",
            file_count: 1,
            total_bytes: 64,
            latest_mtime: "2026-04-22T07:00:00.000Z",
          },
        ],
      },
      recoveryBackupExportData: {
        ok: true,
        export_root: "/tmp/custom-exports",
      },
      backupRoot: "",
      exportRoot: "",
      latestExportArchivePath: "/tmp/custom-exports/latest-export.zip",
      selectedProviderFilePathsCount: 0,
      selectedBackupEligibleFilePathsCount: 0,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 0,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.latestBackupFolder).toBe("/tmp/custom-backups");
    expect(model.latestBackupPath).toBe("/tmp/custom-backups/provider_actions/codex/latest");
    expect(model.exportFolder).toBe("/tmp/custom-exports");
    expect(model.latestExportPath).toBe("/tmp/custom-exports/latest-export.zip");
  });

  it("keeps active backup root semantics when legacy backup sets are present", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: {
        default_backup_root: "~/Documents/ThreadLens/backups",
        backup_root: "/tmp/custom-backups",
        backup_total: 1,
        backup_sets: [
          {
            backup_id: "provider_actions/codex/current",
            path: "/tmp/custom-backups/provider_actions/codex/current",
            file_count: 2,
            total_bytes: 128,
            latest_mtime: "2026-04-22T07:30:00.000Z",
          },
        ],
        legacy_backup_sets: [
          {
            backup_id: "provider_actions/codex/legacy",
            path: "/Users/example/.codex/local_cleanup_backups/provider_actions/codex/legacy",
            file_count: 4,
            total_bytes: 256,
            latest_mtime: "2026-04-22T07:00:00.000Z",
          },
        ],
      },
      recoveryBackupExportData: null,
      backupRoot: "",
      exportRoot: "",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 0,
      selectedBackupEligibleFilePathsCount: 0,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 0,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.latestBackupFolder).toBe("/tmp/custom-backups");
    expect(model.latestBackupPath).toBe("/tmp/custom-backups/provider_actions/codex/current");
    expect(model.availableBackupSets).toBe(1);
    expect(
      (
        model as {
          legacyBackupSets?: Array<{ path: string }>;
        }
      ).legacyBackupSets?.[0]?.path,
    ).toContain("/Users/example/.codex/local_cleanup_backups");
  });

  it("uses provider-scoped backup inventory on provider surfaces", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "gemini",
      selectedProviderLabel: "Gemini",
      providerActionData: null,
      recoveryData: {
        default_backup_root: "~/Documents/ThreadLens/backups",
        default_export_root: "~/Downloads/ThreadLens/recovery-exports",
        backup_root: "~/Documents/ThreadLens/backups",
        backup_total: 20,
        backup_sets: [
          {
            backup_id: "provider_actions/codex/latest",
            path: "~/Documents/ThreadLens/backups/provider_actions/codex/latest",
            file_count: 2,
            total_bytes: 512,
            latest_mtime: "2026-04-22T06:37:16.493Z",
          },
          {
            backup_id: "provider_actions/gemini/latest",
            path: "~/Documents/ThreadLens/backups/provider_actions/gemini/latest",
            file_count: 1,
            total_bytes: 128,
            latest_mtime: "2026-04-22T06:37:10.000Z",
          },
        ],
      },
      recoveryBackupExportData: null,
      backupRoot: "~/Documents/ThreadLens/backups",
      exportRoot: "/tmp/exports",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 0,
      selectedBackupEligibleFilePathsCount: 0,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 0,
      providerActionProvider: "gemini",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.availableBackupSets).toBe(1);
    expect(model.latestBackupPath).toBe(
      "~/Documents/ThreadLens/backups/provider_actions/gemini/latest",
    );
  });

  it("falls back for all-provider view with no backup run", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "all",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: null,
      recoveryBackupExportData: null,
      backupRoot: "~/Documents/ThreadLens/backups",
      exportRoot: "~/Downloads/ThreadLens/recovery-exports",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 0,
      selectedBackupEligibleFilePathsCount: 0,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 0,
      providerActionProvider: "",
      providerDeleteBackupEnabled: false,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("All Providers");
    expect(model.latestBackupPath).toBe("No backup yet.");
    expect(model.availableBackupSets).toBe(0);
    expect(model.latestBackupFolder).toBe("~/Documents/ThreadLens/backups");
    expect(model.exportFolder).toBe("~/Downloads/ThreadLens/recovery-exports");
    expect(model.latestExportPath).toBe("No export yet.");
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
      recoveryData: null,
      recoveryBackupExportData: null,
      backupRoot: "/tmp/backups",
      exportRoot: "/tmp/exports",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 1,
      selectedBackupEligibleFilePathsCount: 1,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 1,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.canRunProviderBackup).toBe(true);
    expect(model.providerLabel).toBe("All Providers");
  });

  it("blocks backup when only cleanup_backups rows are selected", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: null,
      recoveryBackupExportData: null,
      backupRoot: "/tmp/backups",
      exportRoot: "/tmp/exports",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 1,
      selectedBackupEligibleFilePathsCount: 0,
      selectedBackupSourceCount: 1,
      selectedProviderIdsCount: 0,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.canRunProviderBackup).toBe(false);
    expect(model.backupSelectionHint).toContain("cleanup_backups");
    expect(model.actionSelectionHint).toBe("");
  });

  it("keeps backup enabled and explains skips when backup source rows are mixed with sessions rows", () => {
    const model = buildProviderPanelPresentationModel({
      messages,
      providerView: "codex",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: null,
      recoveryBackupExportData: null,
      backupRoot: "/tmp/backups",
      exportRoot: "/tmp/exports",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 2,
      selectedBackupEligibleFilePathsCount: 1,
      selectedBackupSourceCount: 1,
      selectedProviderIdsCount: 0,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.canRunProviderBackup).toBe(true);
    expect(model.selectedBackupEligibleFilePathsCount).toBe(1);
    expect(model.backupSelectionHint).toContain("skipped");
  });

  it("localizes backup hints and toggle labels for Korean all-provider view", () => {
    const koMessages = getMessages("ko");
    const model = buildProviderPanelPresentationModel({
      messages: koMessages,
      providerView: "all",
      selectedProviderLabel: "Codex",
      providerActionData: null,
      recoveryData: null,
      recoveryBackupExportData: null,
      backupRoot: "/tmp/backups",
      exportRoot: "/tmp/exports",
      latestExportArchivePath: "",
      selectedProviderFilePathsCount: 2,
      selectedBackupEligibleFilePathsCount: 2,
      selectedBackupSourceCount: 0,
      selectedProviderIdsCount: 2,
      providerActionProvider: "codex",
      providerDeleteBackupEnabled: true,
      hotspotScopeOrigin: null,
      slowOnly: false,
      canApplySlowOnly: true,
    });

    expect(model.providerLabel).toBe("All Providers");
    expect(model.latestBackupPath).toBe("저장된 백업이 없습니다.");
    expect(model.latestExportPath).toBe("내보낸 파일이 없습니다.");
    expect(model.deleteBackupModeLabel).toBe("켜짐");
    expect(model.backupFolderHint).toContain("provider_actions/<provider>");
    expect(model.backupSelectionHint).toContain("provider");
  });
});
