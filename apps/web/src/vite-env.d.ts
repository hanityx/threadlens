/// <reference types="vite/client" />

type ThreadLensDesktopActionResult = {
  ok: boolean;
  error?: string;
};

type ThreadLensDesktopWindowPayload = {
  view?: "overview" | "search" | "providers" | "threads";
  provider?: string;
  filePath?: string;
  threadId?: string;
};

interface Window {
  threadLensDesktop?: {
    runtime: "electron";
    getApiBaseUrl?: () => Promise<string>;
    revealPath?: (filePath: string) => Promise<ThreadLensDesktopActionResult>;
    openPath?: (filePath: string) => Promise<ThreadLensDesktopActionResult>;
    previewPath?: (filePath: string) => Promise<ThreadLensDesktopActionResult>;
    openWorkbenchWindow?: (
      payload: ThreadLensDesktopWindowPayload,
    ) => Promise<ThreadLensDesktopActionResult>;
  };
}
