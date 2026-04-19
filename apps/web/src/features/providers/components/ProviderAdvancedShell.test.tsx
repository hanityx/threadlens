import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages, type Messages } from "@/i18n";
import { ProviderAdvancedShell } from "@/features/providers/components/ProviderAdvancedShell";

const messages = getMessages("en");

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

    expect(html).toContain("Tools");
    expect(html).toContain("Refresh scan now");
    expect(html).toContain("Last refresh");
    expect(html).toContain("Refresh / scan");
    expect(html).toContain("Scan settings / slow checks");
    expect(html).toContain("Back Codex");
    expect(html).toContain("Last fetch DS 120ms");
    expect(html).toContain("Slow providers 1/4");
    expect(html).toContain("Matrix slot");
    expect(html).not.toContain("<details class=\"inline-tools-disclosure\"");
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
