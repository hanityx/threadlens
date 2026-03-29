import { describe, expect, it, vi } from "vitest";
import { performProviderHardDeleteFlow } from "./useMutations";

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
});
