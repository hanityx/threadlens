import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Agentation } from "agentation";
import { App } from "./App";
import { LocaleProvider } from "./i18n";
import "./design-system/index.css";

const queryClient = new QueryClient();
const agentationEndpoint =
  import.meta.env.VITE_AGENTATION_ENDPOINT ?? "http://127.0.0.1:4747";
const AgentationBridge = Agentation as unknown as React.ComponentType<{
  endpoint: string;
}>;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <App />
        {import.meta.env.DEV ? <AgentationBridge endpoint={agentationEndpoint} /> : null}
      </LocaleProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
