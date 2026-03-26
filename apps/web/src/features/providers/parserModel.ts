import type { ProviderParserHealthReport, ProviderSessionRow } from "../../types";

export type ParserSort =
  | "fail_desc"
  | "fail_asc"
  | "score_desc"
  | "score_asc"
  | "scan_ms_desc"
  | "scan_ms_asc"
  | "name_asc"
  | "name_desc";

export function filterParserReports(
  reports: ProviderParserHealthReport[],
  options: {
    parserFailOnly: boolean;
    effectiveSlowOnly: boolean;
    slowProviderSet: ReadonlySet<string>;
  },
) {
  return (options.parserFailOnly ? reports.filter((report) => Number(report.parse_fail) > 0) : reports).filter(
    (report) => !options.effectiveSlowOnly || options.slowProviderSet.has(report.provider),
  );
}

export function sortParserReports(reports: ProviderParserHealthReport[], parserSort: ParserSort) {
  const rows = [...reports];
  rows.sort((a, b) => {
    if (parserSort === "fail_desc") return Number(b.parse_fail) - Number(a.parse_fail);
    if (parserSort === "fail_asc") return Number(a.parse_fail) - Number(b.parse_fail);
    if (parserSort === "score_desc") return Number(b.parse_score ?? -1) - Number(a.parse_score ?? -1);
    if (parserSort === "score_asc") return Number(a.parse_score ?? 101) - Number(b.parse_score ?? 101);
    if (parserSort === "scan_ms_desc") return Number(b.scan_ms ?? -1) - Number(a.scan_ms ?? -1);
    if (parserSort === "scan_ms_asc") {
      return Number(a.scan_ms ?? Number.MAX_SAFE_INTEGER) - Number(b.scan_ms ?? Number.MAX_SAFE_INTEGER);
    }
    if (parserSort === "name_desc") return String(b.name || "").localeCompare(String(a.name || ""));
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  return rows;
}

export function buildParserDetailState(options: {
  sortedParserReports: ProviderParserHealthReport[];
  parserDetailProvider: string;
  providerSessionRows: ProviderSessionRow[];
  selectedSessionPath: string;
}) {
  const parserReportsWithErrors = options.sortedParserReports.filter(
    (report) => Array.isArray(report.sample_errors) && report.sample_errors.length > 0,
  );
  const resolvedParserDetailProvider =
    parserReportsWithErrors.length === 0
      ? ""
      : parserReportsWithErrors.some((report) => report.provider === options.parserDetailProvider)
        ? options.parserDetailProvider
        : parserReportsWithErrors[0]?.provider ?? "";
  const parserDetailReport =
    parserReportsWithErrors.find((report) => report.provider === resolvedParserDetailProvider) ?? null;
  const selectedSessionProvider =
    options.providerSessionRows.find((row) => row.file_path === options.selectedSessionPath)?.provider ?? "";
  const selectedSessionProviderVisibleInParser =
    !selectedSessionProvider ||
    options.sortedParserReports.some((report) => report.provider === selectedSessionProvider);

  return {
    parserReportsWithErrors,
    resolvedParserDetailProvider,
    parserDetailReport,
    selectedSessionProvider,
    selectedSessionProviderVisibleInParser,
  };
}
