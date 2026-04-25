/// <reference types="vite/client" />

type ThreadLensDesktopActionResult = {
  ok: boolean;
  error?: string;
};

type ThreadLensDesktopWindowPayload = {
  view?: "overview" | "search" | "providers" | "threads";
  provider?: string;
  sessionId?: string;
  filePath?: string;
  threadId?: string;
};

type ThreadLensDesktopDirectoryResult = {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
};

interface Window {
  threadLensDesktop?: {
    runtime: "electron";
    getApiBaseUrl?: () => Promise<string>;
    getApiAuthToken?: () => Promise<string>;
    revealPath?: (filePath: string) => Promise<ThreadLensDesktopActionResult>;
    openPath?: (filePath: string) => Promise<ThreadLensDesktopActionResult>;
    previewPath?: (filePath: string) => Promise<ThreadLensDesktopActionResult>;
    pickDirectory?: (initialPath?: string) => Promise<ThreadLensDesktopDirectoryResult>;
    openWorkbenchWindow?: (
      payload: ThreadLensDesktopWindowPayload,
    ) => Promise<ThreadLensDesktopActionResult>;
  };
}
