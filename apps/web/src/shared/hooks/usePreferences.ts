import { useEffect, useState } from "react";
import type { LayoutView, ProviderView, ProviderDataDepth, UiDensity } from "@/shared/types";
import {
  readPersistedSetupState,
  readStorageValue,
  writeStorageValue,
  THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  LEGACY_DENSITY_STORAGE_KEY,
  LAYOUT_VIEW_STORAGE_KEY,
  LEGACY_LAYOUT_VIEW_STORAGE_KEY,
  PROVIDER_VIEW_STORAGE_KEY,
  PROVIDER_DEPTH_STORAGE_KEY,
  LEGACY_PROVIDER_DEPTH_STORAGE_KEY,
  SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
  LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
  SLOW_PROVIDER_SCAN_MS_DEFAULT,
  SLOW_PROVIDER_SCAN_MS_MIN,
  SLOW_PROVIDER_SCAN_MS_MAX,
} from "@/shared/lib/appState";

const VALID_LAYOUT_VIEWS = new Set<LayoutView>(["overview", "search", "threads", "providers"]);
const VALID_PROVIDER_VIEWS = new Set<ProviderView>(["all", "codex", "claude", "gemini", "copilot"]);

export function clampSlowProviderThresholdMs(raw: number): number {
  return Math.min(SLOW_PROVIDER_SCAN_MS_MAX, Math.max(SLOW_PROVIDER_SCAN_MS_MIN, Math.round(raw)));
}

export function resolveInitialLayoutView(
  storedLayoutView: string | null | undefined,
  routeSearch: string | null | undefined,
): LayoutView {
  const params = new URLSearchParams(String(routeSearch || "").replace(/^\?/, ""));
  const routedView = String(params.get("view") || "").trim();
  if (VALID_LAYOUT_VIEWS.has(routedView as LayoutView)) {
    return routedView as LayoutView;
  }
  const stored = String(storedLayoutView || "").trim();
  if (VALID_LAYOUT_VIEWS.has(stored as LayoutView)) {
    return stored as LayoutView;
  }
  return "overview";
}

export function resolveInitialProviderView(
  storedProviderView: string | null | undefined,
  routeSearch: string | null | undefined,
): ProviderView {
  const params = new URLSearchParams(String(routeSearch || "").replace(/^\?/, ""));
  const routedView = String(params.get("view") || "").trim();
  const routedProvider = String(params.get("provider") || "").trim();
  if (
    routedView === "providers" &&
    routedProvider &&
    VALID_PROVIDER_VIEWS.has(routedProvider as ProviderView)
  ) {
    return routedProvider as ProviderView;
  }
  const stored = String(storedProviderView || "").trim();
  if (!stored || stored === "all") return "all";
  return VALID_PROVIDER_VIEWS.has(stored as ProviderView) ? (stored as ProviderView) : "all";
}

export function usePreferences() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = readStorageValue([THEME_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY]);
    return saved === "light" ? "light" : "dark";
  });
  const [density, setDensity] = useState<UiDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    const saved = readStorageValue([DENSITY_STORAGE_KEY, LEGACY_DENSITY_STORAGE_KEY]);
    return saved === "compact" ? "compact" : "comfortable";
  });
  const [layoutView, setLayoutView] = useState<LayoutView>(() => {
    if (typeof window === "undefined") return "overview";
    return resolveInitialLayoutView(
      readStorageValue([LAYOUT_VIEW_STORAGE_KEY, LEGACY_LAYOUT_VIEW_STORAGE_KEY]),
      window.location.search,
    );
  });
  const [providerView, setProviderView] = useState<ProviderView>(() => {
    if (typeof window === "undefined") return "all";
    return resolveInitialProviderView(
      readPersistedSetupState()?.providerView ?? null,
      window.location.search,
    );
  });
  const [providerDataDepth, setProviderDataDepth] = useState<ProviderDataDepth>(() => {
    if (typeof window === "undefined") return "balanced";
    const saved = readStorageValue([PROVIDER_DEPTH_STORAGE_KEY, LEGACY_PROVIDER_DEPTH_STORAGE_KEY]);
    if (saved === "fast" || saved === "balanced" || saved === "deep") return saved;
    return "balanced";
  });
  const [slowProviderThresholdMs, setSlowProviderThresholdMs] = useState<number>(() => {
    if (typeof window === "undefined") return SLOW_PROVIDER_SCAN_MS_DEFAULT;
    try {
      const raw = Number(
        readStorageValue([
          SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
          LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
        ]),
      );
      if (Number.isFinite(raw)) {
        return clampSlowProviderThresholdMs(raw);
      }
    } catch {
      // ignore parse failures and use default
    }
    return SLOW_PROVIDER_SCAN_MS_DEFAULT;
  });

  /* ---- persistence side effects ---- */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    writeStorageValue(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    writeStorageValue(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    writeStorageValue(LAYOUT_VIEW_STORAGE_KEY, layoutView);
  }, [layoutView]);

  useEffect(() => {
    writeStorageValue(PROVIDER_VIEW_STORAGE_KEY, providerView);
  }, [providerView]);

  useEffect(() => {
    writeStorageValue(PROVIDER_DEPTH_STORAGE_KEY, providerDataDepth);
  }, [providerDataDepth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStorageValue(
      SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
      String(clampSlowProviderThresholdMs(slowProviderThresholdMs)),
    );
  }, [slowProviderThresholdMs]);

  return {
    theme, setTheme,
    density, setDensity,
    layoutView, setLayoutView,
    providerView, setProviderView,
    providerDataDepth, setProviderDataDepth,
    slowProviderThresholdMs, setSlowProviderThresholdMs,
  };
}
