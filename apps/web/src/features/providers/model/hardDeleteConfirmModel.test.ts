import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
  PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEYS,
  buildHardDeleteConfirmRequestState,
  buildHardDeleteConfirmResolvedState,
  readProviderHardDeleteSkipConfirmPref,
  writeProviderHardDeleteSkipConfirmPref,
} from "@/features/providers/model/hardDeleteConfirmModel";

describe("hardDeleteConfirmModel", () => {
  it("reads the current and legacy skip-confirm preference keys", () => {
    const readValue = vi.fn().mockReturnValue("true");

    expect(readProviderHardDeleteSkipConfirmPref(readValue)).toBe(true);
    expect(readValue).toHaveBeenCalledWith(PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEYS);
  });

  it("opens confirm only when the action is enabled and the saved preference is off", () => {
    expect(
      buildHardDeleteConfirmRequestState({
        enabled: false,
        skipConfirmPref: false,
      }),
    ).toEqual({
      confirmOpen: false,
      shouldRunImmediately: false,
      skipConfirmChecked: false,
    });

    expect(
      buildHardDeleteConfirmRequestState({
        enabled: true,
        skipConfirmPref: false,
      }),
    ).toEqual({
      confirmOpen: true,
      shouldRunImmediately: false,
      skipConfirmChecked: false,
    });

    expect(
      buildHardDeleteConfirmRequestState({
        enabled: true,
        skipConfirmPref: true,
      }),
    ).toEqual({
      confirmOpen: false,
      shouldRunImmediately: true,
      skipConfirmChecked: false,
    });
  });

  it("persists the skip-confirm choice and resets transient confirm state", () => {
    const writeValue = vi.fn();

    writeProviderHardDeleteSkipConfirmPref(true, writeValue);
    expect(writeValue).toHaveBeenCalledWith(PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY, "true");

    expect(buildHardDeleteConfirmResolvedState(true)).toEqual({
      confirmOpen: false,
      skipConfirmChecked: false,
      skipConfirmPref: true,
    });
  });
});
