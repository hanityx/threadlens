import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  assertRuntimeBackendReachable,
  buildRecoveryCenterPath,
  formatMutationHookError,
  performProviderHardDeleteFlow,
  RECOVERY_BACKUP_DOWNLOAD_URL_REVOKE_MS,
  resolveBulkActionErrorState,
  resolveMutationBusyState,
  resolveQueryLoadingState,
  resolveRecoveryQueryState,
  resolveSmokeStatusQueryState,
  startRecoveryBackupDownload,
  shouldReturnProviderActionPreview,
  updateProviderActionTokenState,
} from "@/app/hooks/useMutations";
import { removeBackupCleanupTargetsFromThreadsCache } from "@/app/hooks/useThreadMutationActions";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
    ).rejects.toThrow("provider-action-preview-required");
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

  it("throws when the execute response resolves with ok false", async () => {
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
      .mockResolvedValueOnce({
        ok: false,
        provider: "codex",
        action: "delete_local",
        dry_run: false,
        target_count: 1,
        valid_count: 1,
        applied_count: 0,
        confirm_token_expected: "",
        confirm_token_accepted: true,
        backup_before_delete: false,
        error: "no-archived-session-target",
      });

    await expect(
      performProviderHardDeleteFlow(runAction, {
        provider: "codex",
        file_paths: ["/tmp/a.jsonl"],
      }),
    ).rejects.toThrow("no-archived-session-target");
    expect(runAction).toHaveBeenCalledTimes(2);
  });
});

describe("startRecoveryBackupDownload", () => {
  function stubDownloadRuntime(
    response = new Response(new Blob(["fake-zip"], { type: "application/zip" }), { status: 200 }),
  ) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    const createObjectURL = vi.fn().mockReturnValue("blob:threadlens-export");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    return { createObjectURL, fetchMock, revokeObjectURL };
  }

  it("no-ops when document is unavailable", async () => {
    await expect(
      startRecoveryBackupDownload({
        archivePath: "/tmp/threadlens/backups/export-20260330.zip",
        downloadToken: "dl-token-123",
      }),
    ).resolves.toBeUndefined();
  });

  it("no-ops when the archive path is blank", async () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });

    await startRecoveryBackupDownload({
      archivePath: "   ",
      downloadToken: "dl-token-123",
    });

    expect(createElement).not.toHaveBeenCalled();
  });

  it("no-ops when the download token is blank", async () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });

    await startRecoveryBackupDownload({
      archivePath: "/tmp/threadlens/backups/export-20260330.zip",
      downloadToken: "   ",
    });

    expect(createElement).not.toHaveBeenCalled();
  });

  it("fetches and clicks a blob download link for exported archives", async () => {
    vi.useFakeTimers();
    const { createObjectURL, fetchMock, revokeObjectURL } = stubDownloadRuntime();
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = {
      href: "",
      download: "",
      style: { display: "" },
      click,
      remove,
    } as unknown as HTMLAnchorElement;
    const createElement = vi.fn().mockReturnValue(anchor);
    const appendChild = vi.fn();

    vi.stubGlobal("document", {
      body: { appendChild },
      createElement,
    });

    await startRecoveryBackupDownload({
      archivePath: "/tmp/threadlens/backups/export-20260330.zip",
      downloadToken: "dl-token-123",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/recovery-backup-export/download?token=dl-token-123", {
      headers: expect.any(Headers),
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("blob:threadlens-export");
    expect(anchor.download).toBe("export-20260330.zip");
    expect(anchor.style.display).toBe("none");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RECOVERY_BACKUP_DOWNLOAD_URL_REVOKE_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:threadlens-export");
  });

  it("uses the desktop api base url and auth token when the runtime bridge is available", async () => {
    const { fetchMock } = stubDownloadRuntime();
    const click = vi.fn();
    const anchor = {
      href: "",
      download: "",
      style: { display: "" },
      click,
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const createElement = vi.fn().mockReturnValue(anchor);

    vi.stubGlobal("document", {
      body: { appendChild: vi.fn() },
      createElement,
    });
    vi.stubGlobal("window", {
      threadLensDesktop: {
        getApiBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8788"),
        getApiAuthToken: vi.fn().mockResolvedValue("desktop-token"),
      },
    });

    await startRecoveryBackupDownload({
      archivePath: "/tmp/threadlens/backups/export-20260330.zip",
      downloadToken: "dl-token-123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8788/api/recovery-backup-export/download?token=dl-token-123",
      {
        headers: expect.any(Headers),
      },
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("x-threadlens-api-token")).toBe("desktop-token");
    expect(anchor.href).toBe("blob:threadlens-export");
    expect(anchor.download).toBe("export-20260330.zip");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not create a blob URL when the archive download request fails", async () => {
    const { createObjectURL } = stubDownloadRuntime(
      new Response(JSON.stringify({ ok: false, error: "api-auth-required" }), { status: 401 }),
    );
    const click = vi.fn();
    const createElement = vi.fn().mockReturnValue({
      href: "",
      download: "",
      style: { display: "" },
      click,
      remove: vi.fn(),
    });

    vi.stubGlobal("document", {
      body: { appendChild: vi.fn() },
      createElement,
    });

    await expect(
      startRecoveryBackupDownload({
        archivePath: "/tmp/threadlens/backups/export-20260330.zip",
        downloadToken: "dl-token-123",
      }),
    ).rejects.toThrow("recovery-backup-export-download status 401");

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});

describe("useMutations helpers", () => {
  it("removes deleted backup cleanup rows from cached thread queries", () => {
    const queryClient = new QueryClient();
    const cacheKey = ["threads", "backup", 2000, "updated_desc"];
    const keepSession = { thread_id: "live", source: "sessions", local_cache_paths: ["/tmp/live.jsonl"] };
    const deleteBackup = {
      thread_id: "backup-delete",
      source: "cleanup_backups",
      local_cache_paths: ["/tmp/backups/delete.jsonl"],
    };
    const keepBackup = {
      thread_id: "backup-keep",
      source: "cleanup_backups",
      local_cache_paths: ["/tmp/backups/keep.jsonl"],
    };
    queryClient.setQueryData(cacheKey, {
      rows: [keepSession, deleteBackup, keepBackup],
      total: 3,
    });

    removeBackupCleanupTargetsFromThreadsCache(queryClient, {
      ok: true,
      mode: "execute",
      targets: [{ thread_id: "backup-delete", path: "/tmp/backups/delete.jsonl" }],
    });

    expect(queryClient.getQueryData(cacheKey)).toEqual({
      rows: [keepSession, keepBackup],
      total: 2,
    });
  });

  it("removes applied cleanup target rows from cached thread queries", () => {
    const queryClient = new QueryClient();
    const cacheKey = ["threads", "all", 2000, "updated_desc"];
    const deleteSession = { thread_id: "live-delete", source: "sessions", local_cache_paths: ["/tmp/live-delete.jsonl"] };
    const keepSession = { thread_id: "live-keep", source: "sessions", local_cache_paths: ["/tmp/live-keep.jsonl"] };
    queryClient.setQueryData(cacheKey, {
      rows: [deleteSession, keepSession],
      total: 2,
    });

    removeBackupCleanupTargetsFromThreadsCache(queryClient, {
      ok: true,
      mode: "applied",
      deleted_file_count: 1,
      targets: [{ thread_id: "live-delete", path: "/tmp/live-delete.jsonl" }],
    });

    expect(queryClient.getQueryData(cacheKey)).toEqual({
      rows: [keepSession],
      total: 1,
    });
  });

  it("removes partially applied cleanup target rows from cached thread queries", () => {
    const queryClient = new QueryClient();
    const cacheKey = ["threads", "all", 2000, "updated_desc"];
    const deleteSession = { thread_id: "partial-delete", source: "sessions", local_cache_paths: ["/tmp/partial-delete.jsonl"] };
    const keepSession = { thread_id: "partial-keep", source: "sessions", local_cache_paths: ["/tmp/partial-keep.jsonl"] };
    queryClient.setQueryData(cacheKey, {
      rows: [deleteSession, keepSession],
      total: 2,
    });

    removeBackupCleanupTargetsFromThreadsCache(queryClient, {
      ok: true,
      mode: "partial",
      deleted_file_count: 1,
      targets: [{ thread_id: "partial-delete", path: "/tmp/partial-delete.jsonl" }],
    });

    expect(queryClient.getQueryData(cacheKey)).toEqual({
      rows: [keepSession],
      total: 1,
    });
  });

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
      enabled: true,
      refetchInterval: 15000,
    });
    expect(resolveRecoveryQueryState("threads")).toEqual({
      enabled: false,
      refetchInterval: false,
    });
    expect(buildRecoveryCenterPath("")).toBe("/api/recovery-center");
    expect(buildRecoveryCenterPath(" /tmp/threadlens-backups ")).toBe(
      "/api/recovery-center?backup_root=%2Ftmp%2Fthreadlens-backups",
    );
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
