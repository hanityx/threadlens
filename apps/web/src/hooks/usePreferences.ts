import { useEffect, useState } from "react";
import type { LayoutView, ProviderView, ProviderDataDepth, UiDensity } from "../types";
import {
  readStorageValue,
  writeStorageValue,
  THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  LEGACY_DENSITY_STORAGE_KEY,
  PROVIDER_VIEW_STORAGE_KEY,
  LEGACY_PROVIDER_VIEW_STORAGE_KEY,
  PROVIDER_DEPTH_STORAGE_KEY,
  LEGACY_PROVIDER_DEPTH_STORAGE_KEY,
  SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
  LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
  SLOW_PROVIDER_SCAN_MS_DEFAULT,
  SLOW_PROVIDER_SCAN_MS_MIN,
  SLOW_PROVIDER_SCAN_MS_MAX,
} from "./appDataUtils";

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
  const [layoutView, setLayoutView] = useState<LayoutView>("overview");
  const [providerView, setProviderView] = useState<ProviderView>(() => {
    if (typeof window === "undefined") return "all";
    const saved = readStorageValue([PROVIDER_VIEW_STORAGE_KEY, LEGACY_PROVIDER_VIEW_STORAGE_KEY]);
    if (!saved || saved === "all") return "all";
    return saved;
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
        return Math.min(SLOW_PROVIDER_SCAN_MS_MAX, Math.max(SLOW_PROVIDER_SCAN_MS_MIN, Math.round(raw)));
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
    writeStorageValue(PROVIDER_VIEW_STORAGE_KEY, providerView);
  }, [providerView]);

  useEffect(() => {
    writeStorageValue(PROVIDER_DEPTH_STORAGE_KEY, providerDataDepth);
  }, [providerDataDepth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStorageValue(
      SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
      String(Math.min(SLOW_PROVIDER_SCAN_MS_MAX, Math.max(SLOW_PROVIDER_SCAN_MS_MIN, Math.round(slowProviderThresholdMs)))),
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
