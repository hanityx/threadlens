/// <reference types="vite/client" />

type ProviderObservatoryDesktopActionResult = {
  ok: boolean;
  error?: string;
};

type ProviderObservatoryDesktopWindowPayload = {
  view?: "overview" | "search" | "providers" | "threads";
  provider?: string;
  filePath?: string;
  threadId?: string;
};

interface Window {
  providerObservatoryDesktop?: {
    runtime: "electron";
    apiBaseUrl?: string;
    revealPath?: (filePath: string) => Promise<ProviderObservatoryDesktopActionResult>;
    openPath?: (filePath: string) => Promise<ProviderObservatoryDesktopActionResult>;
    previewPath?: (filePath: string) => Promise<ProviderObservatoryDesktopActionResult>;
    openWorkbenchWindow?: (
      payload: ProviderObservatoryDesktopWindowPayload,
    ) => Promise<ProviderObservatoryDesktopActionResult>;
  };
}
