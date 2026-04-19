import { describe, expect, it } from "vitest";
import { getMessages, type Messages } from "@/i18n";
import type { ProviderSessionRow } from "@/shared/types";
import type { CsvColumnKey } from "@/features/providers/lib/helpers";
import {
  buildProviderCsvColumnItems,
  buildProviderCsvExportData,
  getProviderCsvColumnLabel,
} from "@/features/providers/model/providerCsvModel";

const messages = getMessages("en");

const rows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "sess-1",
    display_title: "Codex cleanup",
    file_path: "/tmp/codex.jsonl",
    size_bytes: 120,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Codex cleanup",
      title_source: "header",
    },
  },
];

describe("providerCsvModel", () => {
  it("builds BOM-prefixed CSV payload and scoped filename", () => {
    const result = buildProviderCsvExportData({
      rows,
      enabledColumns: ["provider", "session_id", "probe_ok"] satisfies CsvColumnKey[],
      providerView: "codex",
      stamp: "2026-03-24T10-00-00-000Z",
    });

    expect(result.filename).toBe("provider-sessions-codex-2026-03-24T10-00-00-000Z.csv");
    expect(result.exportedRows).toBe(1);
    expect(result.payload).toBe("\uFEFFprovider,session_id,probe_ok\ncodex,sess-1,ok");
  });

  it("falls back to all columns and all scope label when none are enabled", () => {
    const result = buildProviderCsvExportData({
      rows,
      enabledColumns: [],
      providerView: "all",
      stamp: "2026-03-24T10-00-00-000Z",
    });

    expect(result.filename).toBe("provider-sessions-all-2026-03-24T10-00-00-000Z.csv");
    expect(result.payload).toContain("provider,session_id,title,title_source,source,format,probe_ok,size_bytes,modified,file_path");
  });

  it("maps csv labels and column item checked state", () => {
    expect(getProviderCsvColumnLabel(messages, "session_id")).toBe("Session ID");

    const items = buildProviderCsvColumnItems(messages, {
      provider: true,
      session_id: false,
      title: true,
      title_source: false,
      source: false,
      format: true,
      probe_ok: true,
      size_bytes: false,
      modified: true,
      file_path: false,
    });

    expect(items.find((item) => item.key === "provider")).toEqual({
      key: "provider",
      label: "Provider",
      checked: true,
    });
    expect(items.find((item) => item.key === "session_id")).toEqual({
      key: "session_id",
      label: "Session ID",
      checked: false,
    });
  });
});
