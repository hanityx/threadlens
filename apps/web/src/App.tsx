import { useState } from "react";
import { AppShell } from "@/app/AppShell";
import { AppContext } from "@/app/AppContext";
import { useAppController } from "@/app/hooks/useAppController";
import { useAppShellState } from "@/app/hooks/useAppShellState";
import { useAppData } from "@/app/hooks/useAppData";

export function App() {
  const [providersDiagnosticsOpen, setProvidersDiagnosticsOpen] = useState(false);
  const appData = useAppData({ providersDiagnosticsOpen });
  const shellState = useAppShellState({
    layoutView: appData.layoutView,
    setLayoutView: appData.setLayoutView,
    setProviderView: appData.setProviderView,
  });
  const { ctx, shellProps } = useAppController({
    appData,
    shellState,
    providersDiagnosticsOpen,
    setProvidersDiagnosticsOpen,
  });

  return (
    <AppContext.Provider value={ctx}>
      <AppShell {...shellProps} />
    </AppContext.Provider>
  );
}
