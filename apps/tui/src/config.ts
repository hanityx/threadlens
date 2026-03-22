export type ViewKey = "search" | "sessions" | "cleanup";
export type ProviderScope = "all" | "codex" | "claude" | "gemini" | "copilot";

export type AppBootstrapProps = {
  initialView?: ViewKey;
  initialQuery?: string;
  initialProvider?: ProviderScope;
  initialFilter?: string;
  initialSearchFocus?: "query" | "results";
};

export const VIEWS: Array<{ id: ViewKey; label: string }> = [
  { id: "search", label: "Search" },
  { id: "sessions", label: "Sessions" },
  { id: "cleanup", label: "Cleanup" },
];

export const PROVIDERS: ProviderScope[] = ["all", "codex", "claude", "gemini", "copilot"];
