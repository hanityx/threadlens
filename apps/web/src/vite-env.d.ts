/// <reference types="vite/client" />

interface Window {
  providerObservatoryDesktop?: {
    runtime: "electron";
    apiBaseUrl?: string;
  };
}
