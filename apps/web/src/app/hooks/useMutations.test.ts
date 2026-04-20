import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRuntimeBackendReachable,
  formatMutationHookError,
  performProviderHardDeleteFlow,
  resolveBulkActionErrorState,
  resolveMutationBusyState,
  resolveQueryLoadingState,
  resolveRecoveryQueryState,
  resolveSmokeStatusQueryState,
  startRecoveryBackupDownload,
  shouldReturnProviderActionPreview,
  updateProviderActionTokenState,
} from "@/app/hooks/useMutations";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("performProviderHardDeleteFlow", () => {
  it("requests a preview token and then executes the real delete", async () => {
    const runAction = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        provider: "codex",
        action: "delete_local",
        dry_run: true,
        target_count: 2,
        valid_count: 2,
        applied_count: 0,
        confirm_token_expected: "tok-hard-delete",
        confirm_token_accepted: false,
        backup_before_delete: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        provider: "codex",
        action: "delete_local",
        dry_run: false,
        target_count: 2,
        valid_count: 2,
        applied_count: 2,
        confirm_token_expected: "",
        confirm_token_accepted: true,
        backup_before_delete: false,
      });

    const result = await performProviderHardDeleteFlow(runAction, {
      provider: "codex",
      file_paths: ["/tmp/a.jsonl", "/tmp/b.jsonl"],
    });

    expect(runAction).toHaveBeenNthCalledWith(1, {
      provider: "codex",
      action: "delete_local",
      file_paths: ["/tmp/a.jsonl", "/tmp/b.jsonl"],
      dry_run: true,
      confirm_token: "",
      backup_before_delete: false,
    });
    expect(runAction).toHaveBeenNthCalledWith(2, {
      provider: "codex",
      action: "delete_local",
      file_paths: ["/tmp/a.jsonl", "/tmp/b.jsonl"],
      dry_run: false,
      confirm_token: "tok-hard-delete",
      backup_before_delete: false,
    });
    expect(result.applied_count).toBe(2);
  });

  it("throws when preview does not return a confirm token", async () => {
    const runAction = vi.fn().mockResolvedValueOnce({
      ok: true,
      provider: "codex",
      action: "delete_local",
      dry_run: true,
      target_count: 1,
      valid_count: 1,
      applied_count: 0,
      confirm_token_expected: "",
      confirm_token_accepted: false,
      backup_before_delete: false,
    });

    await expect(
      performProviderHardDeleteFlow(runAction, {
        provider: "codex",
        file_paths: ["/tmp/a.jsonl"],
      }),
    ).rejects.toThrow("provider-hard-delete-preview-required");
  });

  it("surfaces the real delete failure after a valid preview token", async () => {
    const runAction = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        provider: "codex",
        action: "delete_local",
        dry_run: true,
        target_count: 1,
        valid_count: 1,
        applied_count: 0,
        confirm_token_expected: "tok-hard-delete",
        confirm_token_accepted: false,
        backup_before_delete: false,
      })
      .mockRejectedValueOnce(new Error("delete failed"));

    await expect(
      performProviderHardDeleteFlow(runAction, {
        provider: "codex",
        file_paths: ["/tmp/a.jsonl"],
      }),
    ).rejects.toThrow("delete failed");
    expect(runAction).toHaveBeenCalledTimes(2);
  });
});

describe("startRecoveryBackupDownload", () => {
  it("no-ops when document is unavailable", async () => {
    await expect(
      startRecoveryBackupDownload("/tmp/threadlens/backups/export-20260330.zip"),
    ).resolves.toBeUndefined();
  });

  it("no-ops when the archive path is blank", async () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });

    await startRecoveryBackupDownload("   ");

    expect(createElement).not.toHaveBeenCalled();
  });

  it("creates and clicks a download link for exported archives", async () => {
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    const createElement = vi.fn().mockReturnValue(anchor);

    vi.stubGlobal("document", {
      createElement,
    });

    await startRecoveryBackupDownload("/tmp/threadlens/backups/export-20260330.zip");

    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe(
      "/api/recovery-backup-export/download?archive_path=%2Ftmp%2Fthreadlens%2Fbackups%2Fexport-20260330.zip",
    );
    expect(anchor.download).toBe("export-20260330.zip");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("uses the desktop api base url when the runtime bridge is available", async () => {
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    const createElement = vi.fn().mockReturnValue(anchor);

    vi.stubGlobal("document", {
      createElement,
    });
    vi.stubGlobal("window", {
      threadLensDesktop: {
        getApiBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8788"),
      },
    });

    await startRecoveryBackupDownload("/tmp/threadlens/backups/export-20260330.zip");

    expect(anchor.href).toBe(
      "http://127.0.0.1:8788/api/recovery-backup-export/download?archive_path=%2Ftmp%2Fthreadlens%2Fbackups%2Fexport-20260330.zip",
    );
    expect(anchor.download).toBe("export-20260330.zip");
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("useMutations helpers", () => {
  it("derives query gate settings from the current layout", () => {
    expect(resolveSmokeStatusQueryState("overview")).toEqual({
      enabled: true,
      refetchInterval: 20000,
    });
    expect(resolveSmokeStatusQueryState("threads")).toEqual({
      enabled: false,
      refetchInterval: false,
    });
    expect(resolveRecoveryQueryState("overview")).toEqual({
      enabled: true,
      refetchInterval: 15000,
    });
    expect(resolveRecoveryQueryState("providers")).toEqual({
      enabled: false,
      refetchInterval: false,
    });
  });

  it("throws only when the cached runtime backend is known down", () => {
    expect(() => assertRuntimeBackendReachable(true)).not.toThrow();
    expect(() => assertRuntimeBackendReachable(undefined)).not.toThrow();
    expect(() => assertRuntimeBackendReachable(false)).toThrow("runtime-backend-down-cached");
  });

  it("recognizes provider delete preview responses and updates scoped tokens", () => {
    expect(
      shouldReturnProviderActionPreview(
        {
          provider: "codex",
          action: "delete_local",
          file_paths: ["/tmp/a.jsonl"],
          dry_run: false,
          confirm_token: "",
        },
        {
          ok: false,
          provider: "codex",
          action: "delete_local",
          dry_run: false,
          target_count: 1,
          valid_count: 1,
          applied_count: 0,
          confirm_token_expected: "tok-preview",
          confirm_token_accepted: false,
          backup_before_delete: false,
        },
      ),
    ).toBe(true);
    expect(
      shouldReturnProviderActionPreview(
        {
          provider: "codex",
          action: "backup_local",
          file_paths: ["/tmp/a.jsonl"],
          dry_run: false,
          confirm_token: "",
        },
        {
          ok: false,
          provider: "codex",
          action: "backup_local",
          dry_run: false,
          target_count: 1,
          valid_count: 1,
          applied_count: 0,
          confirm_token_expected: "tok-preview",
          confirm_token_accepted: false,
          backup_before_delete: false,
        },
      ),
    ).toBe(false);

    expect(
      updateProviderActionTokenState({}, "k1", "tok-preview", false, false),
    ).toEqual({ k1: "tok-preview" });
    expect(
      updateProviderActionTokenState({ k1: "tok-preview", k2: "keep" }, "k1", "", true, false),
    ).toEqual({ k2: "keep" });
    const unchanged = { k1: "tok-preview" };
    expect(
      updateProviderActionTokenState(unchanged, "k1", "", false, false),
    ).toBe(unchanged);
  });

  it("formats mutation errors and derives bulk-error, busy, and loading state", () => {
    expect(formatMutationHookError(new Error("runtime-down"))).toBe("runtime-down");
    expect(formatMutationHookError("confirm_token_required")).toBe(
      "The confirm token is invalid. Run the dry-run again and retry with the latest token.",
    );
    expect(formatMutationHookError(null)).toBe("");

    expect(
      resolveBulkActionErrorState({
        bulkArchiveError: new Error("archive-failed"),
        bulkPinError: new Error("pin-failed"),
        bulkUnpinError: null,
        bulkArchiveIsError: true,
        bulkPinIsError: false,
        bulkUnpinIsError: false,
      }),
    ).toEqual({
      bulkActionError: true,
      bulkActionErrorMessage: "archive-failed",
    });
    expect(
      resolveBulkActionErrorState({
        bulkArchiveError: null,
        bulkPinError: null,
        bulkUnpinError: null,
        bulkArchiveIsError: false,
        bulkPinIsError: false,
        bulkUnpinIsError: false,
      }),
    ).toEqual({
      bulkActionError: false,
      bulkActionErrorMessage: "",
    });

    expect(
      resolveMutationBusyState({
        bulkPinPending: false,
        bulkUnpinPending: false,
        bulkArchivePending: false,
        analyzeDeletePending: false,
        cleanupDryRunPending: true,
        cleanupExecutePending: false,
        providerSessionActionPending: false,
        recoveryBackupExportPending: false,
      }),
    ).toBe(true);
    expect(
      resolveMutationBusyState({
        bulkPinPending: false,
        bulkUnpinPending: false,
        bulkArchivePending: false,
        analyzeDeletePending: false,
        cleanupDryRunPending: false,
        cleanupExecutePending: false,
        providerSessionActionPending: false,
        recoveryBackupExportPending: false,
      }),
    ).toBe(false);

    expect(resolveQueryLoadingState(true, false)).toBe(true);
    expect(resolveQueryLoadingState(true, true)).toBe(false);
  });
});
