import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Agentation } from "agentation";
import { App } from "@/App";
import { detectPreferredLocale, loadMessages, LocaleProvider } from "@/i18n";
import {
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
} from "@/shared/lib/appState";
import "@/shared/ui/index.css";

const queryClient = new QueryClient();
const agentationEndpoint =
  import.meta.env.VITE_AGENTATION_ENDPOINT ?? "http://127.0.0.1:4747";
const agentationEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AGENTATION_ENABLED === "1";
const AgentationBridge = Agentation as unknown as React.ComponentType<{
  endpoint: string;
}>;

async function bootstrap() {
  const savedLocale =
    window.localStorage.getItem(LOCALE_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
  const locale = detectPreferredLocale({
    savedLocale,
    browserLanguage: window.navigator?.language ?? null,
  });
  const messages = await loadMessages(locale);

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider initialLocale={locale} initialMessages={messages}>
          <App />
          {agentationEnabled ? <AgentationBridge endpoint={agentationEndpoint} /> : null}
        </LocaleProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
