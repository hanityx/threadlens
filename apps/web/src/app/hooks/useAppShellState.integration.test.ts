import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadDismissedUpdateVersion = vi.fn();
const mockReadStorageValue = vi.fn();

vi.mock("@/shared/lib/appState", async () => {
  const actual = await vi.importActual<typeof import("@/shared/lib/appState")>(
    "@/shared/lib/appState",
  );
  return {
    ...actual,
    readDismissedUpdateVersion: () => mockReadDismissedUpdateVersion(),
    readStorageValue: (...args: unknown[]) => mockReadStorageValue(...args),
    persistDismissedUpdateVersion: vi.fn(),
    writeStorageValue: vi.fn(),
  };
});

import { useAppShellState } from "@/app/hooks/useAppShellState";

function renderShellState() {
  const setLayoutView = vi.fn();
  const setProviderView = vi.fn();
  let latest: ReturnType<typeof useAppShellState> | undefined;

  function Harness() {
    latest = useAppShellState({
      layoutView: "overview",
      setLayoutView,
      setProviderView,
    });
    return createElement("div", null, "hook");
  }

  renderToStaticMarkup(createElement(Harness));

  return {
    result: latest as ReturnType<typeof useAppShellState>,
    setLayoutView,
    setProviderView,
  };
}

describe("useAppShellState integration", () => {
  beforeEach(() => {
    mockReadDismissedUpdateVersion.mockReset();
    mockReadStorageValue.mockReset();

    mockReadDismissedUpdateVersion.mockReturnValue("0.2.2");
    mockReadStorageValue.mockReturnValue("search draft");
  });

  it("hydrates persisted shell state without replaying the last Search query", () => {
    const { result } = renderShellState();

    expect(result.dismissedUpdateVersion).toBe("0.2.2");
    expect(result.headerSearchSeed).toBe("");
    expect(result.headerSearchDraft).toBe("");
    expect(result.searchThreadContext).toBeNull();
    expect(result.providerProbeFilterIntent).toBeNull();
    expect(result.setupGuideOpen).toBe(false);
    expect(result.acknowledgedForensicsErrorKeys).toEqual({
      analyze: "",
      cleanup: "",
    });
  });

  it("routes layout and provider changes through the provided setters", () => {
    const { result, setLayoutView, setProviderView } = renderShellState();

    result.changeLayoutView("threads");
    result.changeProviderView("claude");

    expect(setLayoutView).toHaveBeenCalledWith("threads");
    expect(setProviderView).toHaveBeenCalledWith("claude");
  });

  it("falls back cleanly when no stored search seed exists", () => {
    mockReadStorageValue.mockReturnValueOnce(null);

    const { result } = renderShellState();

    expect(result.headerSearchSeed).toBe("");
  });
});
