import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DataSourceInventoryRow, ProviderView } from "@/shared/types";
import { DataSourcesList } from "@/features/providers/components/DataSourcesList";

const copy = {
  disclosure: "Data sources",
  detected: "Detected",
  files: "Files",
  dirs: "Dirs",
  size: "Size",
  updated: "Updated",
  openSessions: "Open sessions",
  ok: "OK",
  fail: "FAIL",
};

const rows: DataSourceInventoryRow[] = [
  {
    source_key: "codex_root",
    path: "/tmp/codex",
    present: true,
    file_count: 12,
    dir_count: 2,
    total_bytes: 2048,
    latest_mtime: "2026-03-24T00:00:00.000Z",
  },
  {
    source_key: "custom_source_key",
    path: "",
    present: false,
    file_count: 0,
    dir_count: 0,
    total_bytes: 0,
    latest_mtime: "2026-03-24T00:00:00.000Z",
  },
];

describe("DataSourcesList", () => {
  it("renders detected counts, labels, and provider session totals for mapped providers", () => {
    const onOpenProviderSessions = vi.fn<(providerId: ProviderView) => void>();
    const html = renderToStaticMarkup(
      <DataSourcesList
        copy={copy}
        dataSourcesLoading={false}
        dataSourceRows={rows}
        providerSessionProviders={[{ provider: "codex", total_bytes: 5 * 1024 * 1024 }]}
        detectedDataSourceCount={1}
        canOpenProviderById={(providerId) => providerId === "codex"}
        onOpenProviderSessions={onOpenProviderSessions}
      />,
    );

    expect(html).toContain("Data sources");
    expect(html).toContain("Detected 1/2");
    expect(html).toContain("Codex root");
    expect(html).toContain("Custom Source Key");
    expect(html).toContain("Open sessions");
    expect(html).toContain("5.0 MB");
    expect(onOpenProviderSessions).not.toHaveBeenCalled();
  });

  it("renders skeleton cards while loading without rows", () => {
    const html = renderToStaticMarkup(
      <DataSourcesList
        copy={copy}
        dataSourcesLoading
        dataSourceRows={[]}
        detectedDataSourceCount={0}
        canOpenProviderById={() => false}
        onOpenProviderSessions={() => undefined}
      />,
    );

    expect(html).toContain("data-source-card");
    expect(html).toContain("skeleton-line");
  });
});
