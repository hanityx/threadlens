import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/api";
import {
  buildHardDeleteConfirmRequestState,
  buildHardDeleteConfirmResolvedState,
  readProviderHardDeleteSkipConfirmPref,
  writeProviderHardDeleteSkipConfirmPref,
} from "@/features/providers/model/hardDeleteConfirmModel";
import type { SessionDetailProps } from "@/features/providers/session/SessionDetail";

export function useSessionDetailActions(props: SessionDetailProps) {
  const {
    messages,
    selectedSession,
    busy,
    canRunSessionAction,
    runSingleProviderHardDelete,
  } = props;
  const [copyNotice, setCopyNotice] = useState("");
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [hardDeleteSkipConfirmChecked, setHardDeleteSkipConfirmChecked] = useState(false);
  const [hardDeleteSkipConfirmPref, setHardDeleteSkipConfirmPref] = useState(
    readProviderHardDeleteSkipConfirmPref,
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const desktopBridge =
    typeof window !== "undefined" ? window.threadLensDesktop : undefined;
  const isElectronRuntime = desktopBridge?.runtime === "electron";

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(""), 1400);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [selectedSession?.file_path]);

  const copyText = async (text: string, label: string) => {
    const value = String(text ?? "").trim();
    if (!value) return;
    try {
      if (window?.navigator?.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyNotice(`${label} ${messages.sessionDetail.copied}`);
    } catch {
      setCopyNotice(`${messages.errors.providerAction}`);
    }
  };

  const runDesktopAction = async (
    action: "reveal" | "open" | "preview",
    label: string,
  ) => {
    if (!selectedSession || !desktopBridge) return;

    const actionMap = {
      reveal: desktopBridge.revealPath,
      open: desktopBridge.openPath,
      preview: desktopBridge.previewPath,
    } as const;
    const handler = actionMap[action];

    if (!handler) {
      setCopyNotice(messages.sessionDetail.desktopUnavailable);
      return;
    }

    const result = await handler(selectedSession.file_path);
    if (!result?.ok) {
      setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
      return;
    }

    if (action === "reveal") {
      setCopyNotice(messages.sessionDetail.revealSuccess);
      return;
    }
    if (action === "preview") {
      setCopyNotice(messages.sessionDetail.previewSuccess);
      return;
    }
    setCopyNotice(`${label} ${messages.sessionDetail.desktopActionReady}`);
  };

  const openDesktopWindow = async () => {
    if (!selectedSession || !desktopBridge?.openWorkbenchWindow) {
      setCopyNotice(messages.sessionDetail.desktopUnavailable);
      return;
    }

    const result = await desktopBridge.openWorkbenchWindow({
      view: "providers",
      provider: selectedSession.provider,
      filePath: selectedSession.file_path,
    });

    if (!result?.ok) {
      setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
      return;
    }

    setCopyNotice(messages.sessionDetail.newWindowSuccess);
  };

  const openCurrentFolder = async () => {
    if (!selectedSession) return;

    const folderPath =
      selectedSession.file_path.replace(/[\\/][^\\/]+$/, "") || selectedSession.file_path;

    try {
      if (desktopBridge?.openPath) {
        const result = await desktopBridge.openPath(folderPath);
        if (!result?.ok) {
          setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
          return;
        }
      } else {
        await apiPost("/api/provider-open-folder", {
          provider: selectedSession.provider,
          file_path: selectedSession.file_path,
        });
      }
      setCopyNotice(messages.sessionDetail.openFolderSuccess);
    } catch (error) {
      setCopyNotice(error instanceof Error ? error.message : messages.sessionDetail.desktopUnavailable);
    }
  };

  const openHardDeleteConfirm = () => {
    const next = buildHardDeleteConfirmRequestState({
      enabled: Boolean(selectedSession && !busy && canRunSessionAction),
      skipConfirmPref: hardDeleteSkipConfirmPref,
    });
    if (!selectedSession) return;
    if (next.shouldRunImmediately) {
      void runSingleProviderHardDelete(selectedSession.provider, selectedSession.file_path);
      return;
    }
    setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
    setHardDeleteConfirmOpen(next.confirmOpen);
  };

  const confirmHardDelete = () => {
    if (!selectedSession || busy || !canRunSessionAction) return;
    writeProviderHardDeleteSkipConfirmPref(hardDeleteSkipConfirmChecked);
    const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmChecked);
    setHardDeleteSkipConfirmPref(next.skipConfirmPref);
    setHardDeleteConfirmOpen(next.confirmOpen);
    void runSingleProviderHardDelete(selectedSession.provider, selectedSession.file_path).finally(() => {
      setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
    });
  };

  const resetHardDeleteConfirm = () => {
    const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmPref);
    setHardDeleteConfirmOpen(next.confirmOpen);
    setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
  };

  return {
    bodyRef,
    isElectronRuntime,
    copyNotice,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    setHardDeleteSkipConfirmChecked,
    openHardDeleteConfirm,
    confirmHardDelete,
    resetHardDeleteConfirm,
    actions: {
      copyText,
      revealInFinder: () => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder),
      openFile: () => void runDesktopAction("open", messages.sessionDetail.openFile),
      previewFile: () => void runDesktopAction("preview", messages.sessionDetail.previewFile),
      openNewWindow: () => void openDesktopWindow(),
      openFolder: () => void openCurrentFolder(),
    },
  };
}
