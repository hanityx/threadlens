import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Messages } from "../../i18n";
import { ProviderAdvancedShell } from "./ProviderAdvancedShell";

const messages = {
  providers: {
    advancedTitle: "Advanced",
    advancedSubtitle: "Parser and scan controls",
    refreshing: "Refreshing",
    refreshNow: "Refresh now",
    lastRefresh: "Last refresh",
    depthLabel: "Depth",
    depthFast: "Fast",
    depthBalanced: "Balanced",
    depthDeep: "Deep",
    slowThresholdLabel: "Slow threshold",
    scopeReturn: "Return",
    parserHint: "Parser hint",
    fetchMsLabel: "Fetch",
    fetchMsDataSources: "Sources",
    fetchMsMatrix: "Matrix",
    fetchMsSessions: "Sessions",
    fetchMsParser: "Parser",
    slowProvidersLabel: "Slow providers",
    slowProvidersNone: "No slow providers",
    fetchMsSlow: "Slow fetch",
  },
} as unknown as Messages;

describe("ProviderAdvancedShell", () => {
  it("renders open disclosure with controls, metrics, and matrix slot", () => {
    const onAdvancedOpenChange = vi.fn();
    const onRefreshProvidersData = vi.fn();
    const onProviderDataDepthChange = vi.fn();
    const onSlowProviderThresholdChange = vi.fn();
    const onReturnHotspotScope = vi.fn();

    const html = renderToStaticMarkup(
      <ProviderAdvancedShell
        messages={messages}
        advancedOpen
        onAdvancedOpenChange={onAdvancedOpenChange}
        onRefreshProvidersData={onRefreshProvidersData}
        providersRefreshing={false}
        providersLastRefreshAt="2026-03-24T08:30:00.000Z"
        providerDataDepth="balanced"
        onProviderDataDepthChange={onProviderDataDepthChange}
        slowProviderThresholdMs={400}
        slowThresholdOptions={[250, 400, 800]}
        onSlowProviderThresholdChange={onSlowProviderThresholdChange}
        canReturnHotspotScope
        hotspotOriginLabel="Codex"
        onReturnHotspotScope={onReturnHotspotScope}
        providerFetchMetrics={{
          data_sources: 120,
          matrix: 240,
          sessions: 360,
          parser: 480,
        }}
        slowProviderIdsCount={1}
        providerTabCount={4}
        slowProviderSummary="Codex 480ms"
        hasSlowProviderFetch
        matrixSlot={<div>Matrix slot</div>}
      />,
    );

    expect(html).toContain("Advanced");
    expect(html).toContain("Refresh now");
    expect(html).toContain("Last refresh");
    expect(html).toContain("Scan settings / slow checks");
    expect(html).toContain("Return Codex");
    expect(html).toContain("Sources 120ms");
    expect(html).toContain("Slow providers 1/4");
    expect(html).toContain("Matrix slot");
    expect(onAdvancedOpenChange).not.toHaveBeenCalled();
    expect(onRefreshProvidersData).not.toHaveBeenCalled();
    expect(onProviderDataDepthChange).not.toHaveBeenCalled();
    expect(onSlowProviderThresholdChange).not.toHaveBeenCalled();
    expect(onReturnHotspotScope).not.toHaveBeenCalled();
  });

  it("renders compact closed state without matrix slot", () => {
    const html = renderToStaticMarkup(
      <ProviderAdvancedShell
        messages={messages}
        advancedOpen={false}
        onAdvancedOpenChange={() => undefined}
        onRefreshProvidersData={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerDataDepth="fast"
        onProviderDataDepthChange={() => undefined}
        slowProviderThresholdMs={400}
        slowThresholdOptions={[250, 400, 800]}
        onSlowProviderThresholdChange={() => undefined}
        canReturnHotspotScope={false}
        hotspotOriginLabel=""
        onReturnHotspotScope={() => undefined}
        providerFetchMetrics={{
          data_sources: null,
          matrix: null,
          sessions: null,
          parser: null,
        }}
        slowProviderIdsCount={0}
        providerTabCount={0}
        slowProviderSummary=""
        hasSlowProviderFetch={false}
        matrixSlot={<div>Matrix slot</div>}
      />,
    );

    expect(html).toContain("Open only when needed.");
    expect(html).not.toContain("Matrix slot");
  });
});
