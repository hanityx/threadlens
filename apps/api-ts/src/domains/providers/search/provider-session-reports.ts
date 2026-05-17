import type { ProviderId } from "../types.js";
import { nowIsoUtc } from "../../../lib/utils.js";
import { getProviderSessionScan } from "./provider-session-scan.js";

const PROVIDER_SESSION_REPORT_TARGETS: ProviderId[] = [
  "codex",
  "chatgpt",
  "claude",
  "gemini",
  "copilot",
];

export async function getProviderSessionsTs(
  provider?: ProviderId,
  limit = 80,
  options?: { forceRefresh?: boolean },
) {
  const targets: ProviderId[] = provider
    ? [provider]
    : PROVIDER_SESSION_REPORT_TARGETS;
  const scans = await Promise.all(
    targets.map((p) => getProviderSessionScan(p, limit, options)),
  );

  const rows = scans.flatMap((scan) => scan.rows);
  return {
    generated_at: nowIsoUtc(),
    summary: {
      providers: scans.length,
      rows: rows.length,
      parse_ok: rows.filter((row) => row.probe.ok).length,
      parse_fail: rows.filter((row) => !row.probe.ok).length,
    },
    providers: scans.map((scan) => ({
      provider: scan.provider,
      name: scan.name,
      status: scan.status,
      scanned: scan.scanned,
      truncated: scan.truncated,
      scan_ms: scan.scan_ms,
      total_bytes: scan.total_bytes,
    })),
    rows,
  };
}

export async function getProviderParserHealthTs(
  provider?: ProviderId,
  limitPerProvider = 80,
  options?: { forceRefresh?: boolean },
) {
  const targets: ProviderId[] = provider
    ? [provider]
    : PROVIDER_SESSION_REPORT_TARGETS;
  const scans = await Promise.all(
    targets.map((item) => getProviderSessionScan(item, limitPerProvider, options)),
  );
  const reports: Array<Record<string, unknown>> = scans.map((scan) => {
    const parseOk = scan.rows.filter((row) => row.probe.ok).length;
    const parseFail = scan.rows.length - parseOk;
    const score = scan.rows.length
      ? Number(((parseOk / scan.rows.length) * 100).toFixed(1))
      : null;
    return {
      provider: scan.provider,
      name: scan.name,
      status: scan.status,
      scanned: scan.rows.length,
      parse_ok: parseOk,
      parse_fail: parseFail,
      parse_score: score,
      truncated: scan.truncated,
      scan_ms: scan.scan_ms,
      sample_errors: scan.rows
        .filter((row) => !row.probe.ok)
        .slice(0, 8)
        .map((row) => ({
          session_id: row.session_id,
          path: row.file_path,
          format: row.probe.format,
          error: row.probe.error,
        })),
    };
  });
  const totalScanned = reports.reduce(
    (sum, row) => sum + Number((row.scanned as number) || 0),
    0,
  );
  const totalFail = reports.reduce(
    (sum, row) => sum + Number((row.parse_fail as number) || 0),
    0,
  );
  const totalOk = reports.reduce(
    (sum, row) => sum + Number((row.parse_ok as number) || 0),
    0,
  );
  return {
    generated_at: nowIsoUtc(),
    summary: {
      providers: reports.length,
      scanned: totalScanned,
      parse_ok: totalOk,
      parse_fail: totalFail,
      parse_score: totalScanned
        ? Number(((totalOk / totalScanned) * 100).toFixed(1))
        : null,
    },
    reports,
  };
}
