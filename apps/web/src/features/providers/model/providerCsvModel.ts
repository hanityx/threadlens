import type { Messages } from "@/i18n";
import type { ProviderSessionRow, ProviderView } from "@/shared/types";
import { CSV_COLUMN_KEYS, csvCell, type CsvColumnKey } from "@/features/providers/lib/helpers";

export function buildProviderCsvExportData(options: {
  rows: ProviderSessionRow[];
  enabledColumns: CsvColumnKey[];
  providerView: ProviderView;
  stamp: string;
}) {
  const headers = options.enabledColumns.length > 0 ? options.enabledColumns : CSV_COLUMN_KEYS;
  const lines = [headers.map(csvCell).join(",")];
  options.rows.forEach((row) => {
    const valuesByKey: Record<CsvColumnKey, unknown> = {
      provider: row.provider,
      session_id: row.session_id,
      title: row.display_title || row.probe.detected_title || row.session_id,
      title_source: row.probe.title_source ?? "",
      source: row.source,
      format: row.probe.format,
      probe_ok: row.probe.ok ? "ok" : "fail",
      size_bytes: row.size_bytes,
      modified: row.mtime,
      file_path: row.file_path,
    };
    lines.push(headers.map((key) => csvCell(valuesByKey[key])).join(","));
  });
  const scope = options.providerView === "all" ? "all" : options.providerView;
  return {
    payload: `\uFEFF${lines.join("\n")}`,
    filename: `provider-sessions-${scope}-${options.stamp}.csv`,
    exportedRows: options.rows.length,
  };
}

export function getProviderCsvColumnLabel(messages: Messages, key: CsvColumnKey): string {
  if (key === "provider") return messages.providers.csvColumnProvider;
  if (key === "session_id") return messages.providers.csvColumnSessionId;
  if (key === "title") return messages.providers.csvColumnTitle;
  if (key === "title_source") return messages.providers.csvColumnTitleSource;
  if (key === "source") return messages.providers.csvColumnSource;
  if (key === "format") return messages.providers.csvColumnFormat;
  if (key === "probe_ok") return messages.providers.csvColumnProbe;
  if (key === "size_bytes") return messages.providers.csvColumnSize;
  if (key === "modified") return messages.providers.csvColumnModified;
  return messages.providers.csvColumnPath;
}

export function buildProviderCsvColumnItems(
  messages: Messages,
  csvColumns: Record<CsvColumnKey, boolean>,
) {
  return CSV_COLUMN_KEYS.map((key) => ({
    key,
    label: getProviderCsvColumnLabel(messages, key),
    checked: Boolean(csvColumns[key]),
  }));
}
