import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { App } from "@/App";

const mockUseAppData = vi.fn();
const mockUseAppShellState = vi.fn();
const mockUseAppController = vi.fn();
const mockAppShell = vi.fn();

vi.mock("@/app/AppShell", () => ({
  AppShell: (props: unknown) => {
    mockAppShell(props);
    return <div data-testid="app-shell">app-shell</div>;
  },
}));

vi.mock("@/app/hooks/useAppData", () => ({
  useAppData: (options: unknown) => mockUseAppData(options),
}));

vi.mock("@/app/hooks/useAppShellState", () => ({
  useAppShellState: (options: unknown) => mockUseAppShellState(options),
}));

vi.mock("@/app/hooks/useAppController", () => ({
  useAppController: (options: unknown) => mockUseAppController(options),
}));

describe("App", () => {
  beforeEach(() => {
    mockUseAppData.mockReset();
    mockUseAppShellState.mockReset();
    mockUseAppController.mockReset();
    mockAppShell.mockReset();

    mockUseAppData.mockReturnValue({
      layoutView: "overview",
      setLayoutView: vi.fn(),
      setProviderView: vi.fn(),
    });
    mockUseAppShellState.mockReturnValue({ shellState: true });
    mockUseAppController.mockReturnValue({
      ctx: { locale: "en" },
      shellProps: { shellMarker: "ok" },
    });
  });

  it("wires app data, shell state, controller, and app shell in order", () => {
    const html = renderToStaticMarkup(<App />);

    expect(mockUseAppData).toHaveBeenCalledWith({ providersDiagnosticsOpen: false });
    expect(mockUseAppShellState).toHaveBeenCalledWith({
      layoutView: "overview",
      setLayoutView: expect.any(Function),
      setProviderView: expect.any(Function),
    });
    expect(mockUseAppController).toHaveBeenCalledWith({
      appData: expect.objectContaining({ layoutView: "overview" }),
      shellState: { shellState: true },
      providersDiagnosticsOpen: false,
      setProvidersDiagnosticsOpen: expect.any(Function),
    });
    expect(mockAppShell).toHaveBeenCalledWith({ shellMarker: "ok" });
    expect(html).toContain("app-shell");
  });
});
