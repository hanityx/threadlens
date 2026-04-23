import type { ProviderProbeFilter } from "@/features/providers/model/sessionTableModel";
import type { ProviderView } from "@/shared/types";

export function resolveProviderViewSwitch(
  currentView: ProviderView,
  nextView: ProviderView,
  selectedSessionPath: string,
) {
  return {
    providerView: nextView,
    selectedSessionPath: currentView === nextView ? selectedSessionPath : "",
  };
}

export function shouldClearFilteredSessionPath(options: {
  selectedSessionPath: string;
  filteredProviderFilePaths: string[];
  sessionFilter: string;
  probeFilter: ProviderProbeFilter;
  sourceFilter: string;
  backupViewScoped?: boolean;
  archivedViewScoped?: boolean;
}) {
  if (!options.selectedSessionPath) return false;
  const hasActiveFilters =
    options.sessionFilter.trim().length > 0 ||
    options.probeFilter !== "all" ||
    options.sourceFilter !== "all" ||
    options.backupViewScoped === true ||
    options.archivedViewScoped === true;
  if (!hasActiveFilters) return false;
  return !options.filteredProviderFilePaths.includes(options.selectedSessionPath);
}

export function pruneSelectedProviderFilesForFilteredScope(options: {
  selectedProviderFiles: Record<string, boolean>;
  filteredProviderFilePaths: string[];
  sessionFilter: string;
  probeFilter: ProviderProbeFilter;
  sourceFilter: string;
  backupViewScoped?: boolean;
  archivedViewScoped?: boolean;
}) {
  const hasActiveFilters =
    options.sessionFilter.trim().length > 0 ||
    options.probeFilter !== "all" ||
    options.sourceFilter !== "all" ||
    options.backupViewScoped === true ||
    options.archivedViewScoped === true;
  if (!hasActiveFilters) return options.selectedProviderFiles;
  const filteredSet = new Set(options.filteredProviderFilePaths);
  let changed = false;
  const next: Record<string, boolean> = {};
  for (const [filePath, selected] of Object.entries(options.selectedProviderFiles)) {
    if (!selected) continue;
    if (filteredSet.has(filePath)) {
      next[filePath] = true;
      continue;
    }
    changed = true;
  }
  return changed ? next : options.selectedProviderFiles;
}

export function clearDesktopRouteProviderFilePath(nextProviderView: ProviderView) {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") !== "providers") return false;
  if (!params.get("filePath")) return false;
  params.set("provider", nextProviderView || "all");
  params.delete("filePath");
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
  return true;
}

export function shouldShowProviderSessionDetailSlot(options: {
  selectedSessionPath: string;
  filteredProviderFilePaths: string[];
  sessionFilter: string;
  probeFilter: ProviderProbeFilter;
  sourceFilter: string;
  backupViewScoped?: boolean;
  archivedViewScoped?: boolean;
}) {
  if (options.selectedSessionPath) return true;
  const hasActiveFilters =
    options.sessionFilter.trim().length > 0 ||
    options.probeFilter !== "all" ||
    options.sourceFilter !== "all" ||
    options.backupViewScoped === true ||
    options.archivedViewScoped === true;
  if (!hasActiveFilters) return true;
  return options.filteredProviderFilePaths.length > 0;
}
