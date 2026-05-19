import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/App";
import { detectPreferredLocale, loadMessages, LocaleProvider } from "@/i18n";
import {
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
} from "@/shared/lib/appState";
import "@/shared/ui/index.css";

const queryClient = new QueryClient();

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
        </LocaleProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
