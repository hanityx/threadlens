import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutations } from "@/app/hooks/useMutations";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

type MutationState = {
  mutate: ReturnType<typeof vi.fn>;
  mutateAsync: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  isError: boolean;
  isPending: boolean;
  error: unknown;
};

function makeMutationState(overrides: Partial<MutationState> = {}): MutationState {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isError: false,
    isPending: false,
    error: null,
    ...overrides,
  };
}

function makeQueryState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

function renderMutations(options?: {
  layoutView?: "overview" | "providers" | "threads" | "search";
  providerActionProvider?: string;
  selectedProviderFilePaths?: string[];
  runtimeQuery?: Record<string, unknown>;
  smokeStatusQuery?: Record<string, unknown>;
  recoveryQuery?: Record<string, unknown>;
  mutations?: MutationState[];
}) {
  const queryClient = {
    invalidateQueries: vi.fn(),
  };
  const states = options?.mutations ?? [
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
    makeMutationState(),
  ];

  mockUseQueryClient.mockReturnValue(queryClient);

  const queries = [
    makeQueryState(options?.runtimeQuery),
    makeQueryState(options?.smokeStatusQuery),
    makeQueryState(options?.recoveryQuery),
  ];
  let queryIndex = 0;
  mockUseQuery.mockImplementation(() => queries[queryIndex++]);

  let mutationIndex = 0;
  mockUseMutation.mockImplementation(() => states[mutationIndex++]);

  let latest: ReturnType<typeof useMutations> | undefined;

  function Harness() {
    latest = useMutations({
      layoutView: options?.layoutView ?? "overview",
      providerActionProvider: options?.providerActionProvider ?? "codex",
      selectedProviderFilePaths: options?.selectedProviderFilePaths ?? ["/tmp/codex-a.jsonl"],
    });
    return createElement("div", null, "hook");
  }

  renderToStaticMarkup(createElement(Harness));

  return {
    result: latest as ReturnType<typeof useMutations>,
    queryClient,
    states,
  };
}

describe("useMutations integration", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseQueryClient.mockReset();
  });

  it("derives overview runtime and recovery state from live queries", () => {
    const { result } = renderMutations({
      layoutView: "overview",
      runtimeQuery: {
        data: { data: { runtime_backend: { reachable: true, latency_ms: 92 } } },
      },
      smokeStatusQuery: {
        data: { data: { latest: { id: "smoke-1", status: "pass" } } },
      },
      recoveryQuery: {
        data: {
          data: {
            backup_root: "/tmp/threadlens-backups/current",
            default_backup_root: "/tmp/threadlens-backups/default",
            summary: { backup_sets: 3 },
          },
        },
      },
    });

    expect(result.runtime.data?.data?.runtime_backend?.latency_ms).toBe(92);
    expect(result.smokeStatusLatest).toEqual({ id: "smoke-1", status: "pass" });
    expect((result.recovery.data as { data?: { summary?: { backup_sets?: number } } } | undefined)?.data?.summary?.backup_sets).toBe(3);
    expect(
      (
        result.recovery.data as {
          data?: { backup_root?: string; default_backup_root?: string };
        } | undefined
      )?.data,
    ).toMatchObject({
      backup_root: "/tmp/threadlens-backups/current",
      default_backup_root: "/tmp/threadlens-backups/default",
    });
    expect(result.runtimeLoading).toBe(false);
    expect(result.smokeStatusLoading).toBe(false);
    expect(result.recoveryLoading).toBe(false);
    expect(result.busy).toBe(false);
  });

  it("surfaces busy and formatted error state across bulk, cleanup, and provider actions", () => {
    const { result } = renderMutations({
      mutations: [
        makeMutationState(),
        makeMutationState({
          isError: true,
          isPending: true,
          error: new Error("runtime-backend-down-cached: runtime-down"),
        }),
        makeMutationState(),
        makeMutationState(),
        makeMutationState({
          isError: true,
          error: new Error("no-valid-thread-ids"),
        }),
        makeMutationState(),
        makeMutationState({
          isError: true,
          error: new Error("cleanup-preview-required"),
        }),
        makeMutationState(),
        makeMutationState({
          isError: true,
          error: new Error("provider-session-action status 409"),
        }),
        makeMutationState({
          isPending: true,
        }),
      ],
    });

    expect(result.bulkActionError).toBe(true);
    expect(result.bulkActionErrorMessage).toContain("runtime connection");
    expect(result.analyzeDeleteError).toBe(true);
    expect(result.analyzeDeleteErrorMessage).toContain("valid thread");
    expect(result.cleanupExecuteError).toBe(true);
    expect(result.cleanupExecuteErrorMessage).toContain("cleanup dry-run");
    expect(result.providerSessionActionError).toBe(true);
    expect(result.providerSessionActionErrorMessage).toContain("409");
    expect(result.recoveryBackupExportError).toBe(false);
    expect(result.busy).toBe(true);
  });

  it("dispatches provider and thread actions through the current mutation handles", async () => {
    const bulkPin = makeMutationState();
    const bulkUnpin = makeMutationState();
    const bulkArchive = makeMutationState();
    const bulkUnarchive = makeMutationState();
    const analyzeDelete = makeMutationState();
    const cleanupDryRun = makeMutationState();
    const cleanupExecute = makeMutationState();
    const cleanupBackupsExecute = makeMutationState();
    const providerSessionAction = makeMutationState({
      isError: true,
      mutateAsync: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          confirm_token_expected: "tok-hard-delete",
        })
        .mockResolvedValueOnce({
          ok: true,
          confirm_token_expected: "",
        })
        .mockResolvedValueOnce({
          ok: true,
          confirm_token_expected: "tok-hard-delete",
        })
        .mockResolvedValueOnce({
          ok: true,
          confirm_token_expected: "",
        }),
    });
    const recoveryBackupExport = makeMutationState({
      isError: true,
    });

    const { result } = renderMutations({
      mutations: [
        bulkPin,
        bulkUnpin,
        bulkArchive,
        bulkUnarchive,
        analyzeDelete,
        cleanupDryRun,
        cleanupExecute,
        cleanupBackupsExecute,
        providerSessionAction,
        recoveryBackupExport,
      ],
    });

    result.setBackupRoot("/tmp/threadlens-backups");
    result.setExportRoot("/tmp/threadlens-exports");
    result.bulkPin(["thread-1"]);
    result.bulkUnpin(["thread-2"]);
    result.bulkArchive(["thread-3"]);
    result.bulkUnarchive(["thread-archived"]);
    result.analyzeDelete(["thread-4"]);
    result.cleanupDryRun(["thread-5"]);
    result.cleanupExecute(["thread-6"]);
    result.runProviderAction("delete_local", false);
    result.runSingleProviderAction("claude", "/tmp/claude-a.jsonl", "archive_local", true);
    result.runRecoveryBackupExport(["backup-1"]);
    await result.runProviderHardDelete();
    await result.runSingleProviderHardDelete("claude", "/tmp/claude-a.jsonl");

    expect(bulkPin.mutate).toHaveBeenCalledWith(["thread-1"]);
    expect(bulkUnpin.mutate).toHaveBeenCalledWith(["thread-2"]);
    expect(bulkArchive.mutate).toHaveBeenCalledWith(["thread-3"]);
    expect(bulkUnarchive.mutate).toHaveBeenCalledWith(["thread-archived"]);
    expect(analyzeDelete.mutate).toHaveBeenCalledWith({
      ids: ["thread-4"],
      sessionScanLimit: undefined,
    });
    expect(cleanupDryRun.mutate).toHaveBeenCalledWith(["thread-5"]);
    expect(cleanupExecute.mutate).toHaveBeenCalledWith(["thread-6"]);

    expect(providerSessionAction.reset).toHaveBeenCalled();
    expect(providerSessionAction.mutate).toHaveBeenNthCalledWith(1, {
      provider: "codex",
      action: "delete_local",
      file_paths: ["/tmp/codex-a.jsonl"],
      dry_run: false,
      confirm_token: "",
      backup_before_delete: undefined,
      backup_root: "/tmp/threadlens-backups",
    });
    expect(providerSessionAction.mutate).toHaveBeenNthCalledWith(2, {
      provider: "claude",
      action: "archive_local",
      file_paths: ["/tmp/claude-a.jsonl"],
      dry_run: true,
      confirm_token: "",
      backup_before_delete: undefined,
      backup_root: "/tmp/threadlens-backups",
    });
    expect(recoveryBackupExport.reset).toHaveBeenCalled();
    expect(recoveryBackupExport.mutate).toHaveBeenCalledWith({
      backupIds: ["backup-1"],
      backupRoot: "/tmp/threadlens-backups",
      exportRoot: "/tmp/threadlens-exports",
    });

    expect(providerSessionAction.mutateAsync).toHaveBeenNthCalledWith(1, {
      provider: "codex",
      action: "delete_local",
      file_paths: ["/tmp/codex-a.jsonl"],
      dry_run: true,
      confirm_token: "",
      backup_before_delete: false,
      backup_root: "/tmp/threadlens-backups",
    });
    expect(providerSessionAction.mutateAsync).toHaveBeenNthCalledWith(2, {
      provider: "codex",
      action: "delete_local",
      file_paths: ["/tmp/codex-a.jsonl"],
      dry_run: false,
      confirm_token: "tok-hard-delete",
      backup_before_delete: false,
      backup_root: "/tmp/threadlens-backups",
    });
    expect(providerSessionAction.mutateAsync).toHaveBeenNthCalledWith(3, {
      provider: "claude",
      action: "delete_local",
      file_paths: ["/tmp/claude-a.jsonl"],
      dry_run: true,
      confirm_token: "",
      backup_before_delete: false,
      backup_root: "/tmp/threadlens-backups",
    });
    expect(providerSessionAction.mutateAsync).toHaveBeenNthCalledWith(4, {
      provider: "claude",
      action: "delete_local",
      file_paths: ["/tmp/claude-a.jsonl"],
      dry_run: false,
      confirm_token: "tok-hard-delete",
      backup_before_delete: false,
      backup_root: "/tmp/threadlens-backups",
    });
  });

  it("keeps provider dispatchers inert when no provider selection exists", () => {
    const providerSessionAction = makeMutationState({
      isError: true,
    });

    const { result } = renderMutations({
      providerActionProvider: "",
      selectedProviderFilePaths: [],
      mutations: [
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        providerSessionAction,
        makeMutationState(),
      ],
    });

    result.runProviderAction("backup_local", false);

    expect(providerSessionAction.reset).not.toHaveBeenCalled();
    expect(providerSessionAction.mutate).not.toHaveBeenCalled();
  });

  it("fans out grouped provider backups and returns a combined backup summary", async () => {
    const providerSessionAction = makeMutationState({
      mutateAsync: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          provider: "codex",
          action: "backup_local",
          dry_run: false,
          target_count: 1,
          valid_count: 1,
          applied_count: 1,
          confirm_token_expected: "",
          confirm_token_accepted: true,
          backed_up_count: 1,
          backup_id: "provider_actions/codex/latest",
          backup_to: "/tmp/threadlens-backups/provider_actions/codex/latest",
          backup_manifest_path: "/tmp/threadlens-backups/provider_actions/codex/latest/manifest.json",
        })
        .mockResolvedValueOnce({
          ok: true,
          provider: "claude",
          action: "backup_local",
          dry_run: false,
          target_count: 2,
          valid_count: 2,
          applied_count: 2,
          confirm_token_expected: "",
          confirm_token_accepted: true,
          backed_up_count: 2,
          backup_id: "provider_actions/claude/latest",
          backup_to: "/tmp/threadlens-backups/provider_actions/claude/latest",
          backup_manifest_path: "/tmp/threadlens-backups/provider_actions/claude/latest/manifest.json",
        }),
    });

    const { result } = renderMutations({
      mutations: [
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        providerSessionAction,
        makeMutationState(),
      ],
    });

    result.setBackupRoot("/tmp/threadlens-backups");
    const combined = await result.runGroupedProviderBackup([
      { provider: "codex", file_paths: ["/tmp/codex-a.jsonl"] },
      { provider: "claude", file_paths: ["/tmp/claude-a.jsonl", "/tmp/claude-b.jsonl"] },
    ]);

    expect(providerSessionAction.mutateAsync).toHaveBeenNthCalledWith(1, {
      provider: "codex",
      action: "backup_local",
      file_paths: ["/tmp/codex-a.jsonl"],
      dry_run: false,
      confirm_token: "",
      backup_root: "/tmp/threadlens-backups",
    });
    expect(providerSessionAction.mutateAsync).toHaveBeenNthCalledWith(2, {
      provider: "claude",
      action: "backup_local",
      file_paths: ["/tmp/claude-a.jsonl", "/tmp/claude-b.jsonl"],
      dry_run: false,
      confirm_token: "",
      backup_root: "/tmp/threadlens-backups",
    });
    expect(combined).toMatchObject({
      ok: true,
      provider: "all",
      action: "backup_local",
      target_count: 3,
      valid_count: 3,
      applied_count: 3,
      backed_up_count: 3,
      backup_ids: ["provider_actions/codex/latest", "provider_actions/claude/latest"],
      backup_to: "/tmp/threadlens-backups/provider_actions",
    });
  });

  it("backs up selected provider groups and exports the created backup sets as a ZIP", async () => {
    const providerSessionAction = makeMutationState({
      mutateAsync: vi.fn().mockResolvedValue({
        ok: true,
        provider: "codex",
        action: "backup_local",
        dry_run: false,
        target_count: 1,
        valid_count: 1,
        applied_count: 1,
        confirm_token_expected: "",
        confirm_token_accepted: true,
        backed_up_count: 1,
        backup_id: "provider_actions/codex/latest",
      }),
    });
    const recoveryBackupExport = makeMutationState();

    const { result } = renderMutations({
      mutations: [
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        makeMutationState(),
        providerSessionAction,
        recoveryBackupExport,
      ],
    });

    result.setBackupRoot("/tmp/threadlens-backups");
    result.setExportRoot("/tmp/threadlens-exports");
    const combined = await result.runGroupedProviderBackupExport([
      { provider: "codex", file_paths: ["/tmp/codex-a.jsonl"] },
    ]);

    expect(combined?.backup_ids).toEqual(["provider_actions/codex/latest"]);
    expect(recoveryBackupExport.mutate).toHaveBeenCalledWith({
      backupIds: ["provider_actions/codex/latest"],
      backupRoot: "/tmp/threadlens-backups",
      exportRoot: "/tmp/threadlens-exports",
    });
  });

});
