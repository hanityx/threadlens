import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./constants.js";
import {
  isRecord,
  nowIsoUtc,
  parseNumber,
  pathExists,
  safeJsonParse,
} from "../../lib/utils.js";

const SMOKE_SUMMARY_DIR = path.join(PROJECT_ROOT, ".run", "smoke");
const SMOKE_SUMMARY_FILE_RE = /^smoke-summary-(\d{8}T\d{6}Z)\.json$/;
const PERF_SMOKE_DIR = path.join(PROJECT_ROOT, ".run", "perf");
const PERF_SMOKE_FILE_RE = /^perf-smoke-(\d{8}T\d{6}Z)\.json$/;
const FORENSICS_SMOKE_DIR = path.join(PROJECT_ROOT, ".run", "forensics");
const FORENSICS_SMOKE_FILE_RE = /^forensics-smoke-(\d{8}T\d{6}Z)\.json$/;

type SmokeStatusRootOverrides = Partial<{
  summary_dir_abs: string;
  summary_dir_rel: string;
  perf_dir_abs: string;
  perf_dir_rel: string;
  forensics_dir_abs: string;
  forensics_dir_rel: string;
}>;

type SmokeStatusRoots = {
  summary_dir_abs: string;
  summary_dir_rel: string;
  perf_dir_abs: string;
  perf_dir_rel: string;
  forensics_dir_abs: string;
  forensics_dir_rel: string;
};

function resolveSmokeStatusRoots(
  overrides?: SmokeStatusRootOverrides,
): SmokeStatusRoots {
  const summaryDirRel = String(overrides?.summary_dir_rel ?? ".run/smoke").trim();
  const perfDirRel = String(overrides?.perf_dir_rel ?? ".run/perf").trim();
  const forensicsDirRel = String(overrides?.forensics_dir_rel ?? ".run/forensics").trim();
  return {
    summary_dir_abs: String(overrides?.summary_dir_abs ?? SMOKE_SUMMARY_DIR),
    summary_dir_rel: summaryDirRel || ".run/smoke",
    perf_dir_abs: String(overrides?.perf_dir_abs ?? PERF_SMOKE_DIR),
    perf_dir_rel: perfDirRel || ".run/perf",
    forensics_dir_abs: String(overrides?.forensics_dir_abs ?? FORENSICS_SMOKE_DIR),
    forensics_dir_rel: forensicsDirRel || ".run/forensics",
  };
}

function parseNullableNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTimestampFromFileName(fileName: string, fileNameRe: RegExp): string {
  const match = fileNameRe.exec(String(fileName || "").trim());
  return match?.[1] ?? "";
}

function parseSmokeTimestampFromName(fileName: string): string {
  return parseTimestampFromFileName(fileName, SMOKE_SUMMARY_FILE_RE);
}

function parseSmokeTimestampUtcMs(timestampUtc: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    String(timestampUtc || "").trim(),
  );
  if (!match) return null;
  const [, yyyy, mm, dd, hh, mi, ss] = match;
  const ms = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss),
  );
  return Number.isFinite(ms) ? ms : null;
}

function normalizeSmokePath(value: unknown): string {
  const text = String(value ?? "").trim();
  return text ? text.replace(/\\/g, "/") : "";
}

type LatestSmokeFile = {
  file_name: string;
  abs_path: string;
  rel_path: string;
  timestamp_utc: string;
};

async function findLatestSmokeFile(
  dirPath: string,
  fileNameRe: RegExp,
  relDirPath: string,
): Promise<LatestSmokeFile | null> {
  if (!(await pathExists(dirPath))) return null;
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isFile() && fileNameRe.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!names.length) return null;
  const fileName = names[names.length - 1];
  return {
    file_name: fileName,
    abs_path: path.join(dirPath, fileName),
    rel_path: path.posix.join(relDirPath, fileName),
    timestamp_utc: parseTimestampFromFileName(fileName, fileNameRe),
  };
}

function readPerfMetricSeconds(
  metrics: unknown,
  key: string,
): number | null {
  if (!Array.isArray(metrics)) return null;
  const row = metrics.find((item) => {
    if (!isRecord(item)) return false;
    return String(item.key ?? "").trim() === key;
  });
  if (!isRecord(row)) return null;
  return parseNullableNumber(row.time_total);
}

type SmokeStatusFlag = "pass" | "fail" | "missing" | "invalid";
type SmokeResult = "PASS" | "FAIL" | "MISSING" | "INVALID";

function buildSmokeStatusSkeleton(
  status: SmokeStatusFlag,
  result: SmokeResult,
  overrides?: Partial<{
    timestamp_utc: string;
    path: string;
    age_sec: number | null;
    parse_error: string;
  }>,
) {
  return {
    status,
    result,
    ok: status === "pass",
    timestamp_utc: overrides?.timestamp_utc ?? "",
    age_sec: overrides?.age_sec ?? null,
    path: overrides?.path ?? "",
    sources: {
      perf_report: "",
      forensics_report: "",
    },
    perf: {
      ok: false,
      agent_runtime_sec: null as number | null,
      provider_sessions_30_sec: null as number | null,
      threads_60_sec: null as number | null,
      threads_160_sec: null as number | null,
    },
    forensics: {
      result: "",
      analyze_status: null as number | null,
      cleanup_status: null as number | null,
      cleanup_token_valid: null as boolean | null,
    },
    parse_error: overrides?.parse_error ?? "",
  };
}

async function buildSmokeStatusFromRawReports(roots: SmokeStatusRoots) {
  const latestPerf = await findLatestSmokeFile(
    roots.perf_dir_abs,
    PERF_SMOKE_FILE_RE,
    roots.perf_dir_rel,
  );
  const latestForensics = await findLatestSmokeFile(
    roots.forensics_dir_abs,
    FORENSICS_SMOKE_FILE_RE,
    roots.forensics_dir_rel,
  );
  if (!latestPerf && !latestForensics) return null;

  const issues: string[] = [];
  const perfRaw = latestPerf
    ? safeJsonParse(await readFile(latestPerf.abs_path, "utf-8").catch(() => ""))
    : null;
  const forensicsRaw = latestForensics
    ? safeJsonParse(await readFile(latestForensics.abs_path, "utf-8").catch(() => ""))
    : null;
  const perfObj = isRecord(perfRaw) ? perfRaw : null;
  const forensicsObj = isRecord(forensicsRaw) ? forensicsRaw : null;

  if (latestPerf && !perfObj) issues.push("perf-report-parse-failed");
  if (latestForensics && !forensicsObj) issues.push("forensics-report-parse-failed");

  const perfOk = perfObj ? Boolean(perfObj.ok) : false;
  const forensicsResultRaw = String(forensicsObj?.result ?? "").trim().toUpperCase();
  const forensicsOk = forensicsResultRaw === "PASS";

  const latestTimestamp = [latestPerf?.timestamp_utc ?? "", latestForensics?.timestamp_utc ?? ""]
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
  const timestampMs = parseSmokeTimestampUtcMs(latestTimestamp);
  const ageSec =
    timestampMs === null
      ? null
      : Math.max(0, Math.round((Date.now() - timestampMs) / 1000));

  let status: SmokeStatusFlag = "invalid";
  let result: SmokeResult = "INVALID";
  if (perfObj && forensicsObj) {
    status = perfOk && forensicsOk ? "pass" : "fail";
    result = perfOk && forensicsOk ? "PASS" : "FAIL";
  }

  const forensicsMetrics = isRecord(forensicsObj?.metrics)
    ? (forensicsObj.metrics as Record<string, unknown>)
    : {};
  const forensicsAnalyze = isRecord(forensicsMetrics.analyze_delete)
    ? (forensicsMetrics.analyze_delete as Record<string, unknown>)
    : {};
  const forensicsCleanup = isRecord(forensicsMetrics.local_cleanup)
    ? (forensicsMetrics.local_cleanup as Record<string, unknown>)
    : {};

  return {
    latest: {
      status,
      result,
      ok: status === "pass",
      timestamp_utc: latestTimestamp,
      age_sec: ageSec,
      path: "",
      sources: {
        perf_report: latestPerf?.rel_path ?? "",
        forensics_report: latestForensics?.rel_path ?? "",
      },
      perf: {
        ok: perfObj ? perfOk : false,
        agent_runtime_sec: readPerfMetricSeconds(perfObj?.metrics, "agent_runtime"),
        provider_sessions_30_sec: readPerfMetricSeconds(
          perfObj?.metrics,
          "provider_sessions_30",
        ),
        threads_60_sec: readPerfMetricSeconds(perfObj?.metrics, "threads_60"),
        threads_160_sec: readPerfMetricSeconds(perfObj?.metrics, "threads_160"),
      },
      forensics: {
        result: forensicsResultRaw,
        analyze_status: parseNullableNumber(forensicsAnalyze.status),
        cleanup_status: parseNullableNumber(forensicsCleanup.status),
        cleanup_token_valid:
          typeof forensicsCleanup.confirm_token_valid === "boolean"
            ? forensicsCleanup.confirm_token_valid
            : null,
      },
      parse_error: issues.join(","),
    },
    history: [] as Array<{ timestamp_utc: string; path: string }>,
  };
}

type SmokeStatusData = {
  generated_at: string;
  summary_dir: string;
  latest: ReturnType<typeof buildSmokeStatusSkeleton>;
  history: Array<{ timestamp_utc: string; path: string }>;
};

const SMOKE_STATUS_CACHE_TTL_MS = 10_000;
const smokeStatusCache = new Map<
  number,
  { expires_at: number; data: SmokeStatusData }
>();
const smokeStatusInflight = new Map<number, Promise<SmokeStatusData>>();

export async function getLatestSmokeStatusTs(options?: {
  historyLimit?: number;
  roots?: SmokeStatusRootOverrides;
  forceRefresh?: boolean;
}) {
  const historyLimit = Math.max(
    1,
    Math.min(20, parseNumber(options?.historyLimit, 6)),
  );
  const roots = resolveSmokeStatusRoots(options?.roots);
  const useDefaultRoots = !options?.roots;
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (useDefaultRoots && !forceRefresh) {
    const cached = smokeStatusCache.get(historyLimit);
    if (cached && cached.expires_at > now) return cached.data;
    const inflight = smokeStatusInflight.get(historyLimit);
    if (inflight) return inflight;
  }

  const compute = async (): Promise<SmokeStatusData> => {
    const summaryDirRelative = roots.summary_dir_rel;
    const generatedAt = nowIsoUtc();

    if (!(await pathExists(roots.summary_dir_abs))) {
      const fallback = await buildSmokeStatusFromRawReports(roots);
      if (fallback) {
        return {
          generated_at: generatedAt,
          summary_dir: summaryDirRelative,
          latest: fallback.latest,
          history: fallback.history,
        };
      }
      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: buildSmokeStatusSkeleton("missing", "MISSING"),
        history: [],
      };
    }

    const entries = await readdir(roots.summary_dir_abs, { withFileTypes: true }).catch(
      () => [],
    );
    const summaryFiles = entries
      .filter((entry) => entry.isFile() && SMOKE_SUMMARY_FILE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const history = summaryFiles
      .slice(-historyLimit)
      .reverse()
      .map((fileName) => ({
        timestamp_utc: parseSmokeTimestampFromName(fileName),
        path: path.posix.join(summaryDirRelative, fileName),
      }));

    if (!summaryFiles.length) {
      const fallback = await buildSmokeStatusFromRawReports(roots);
      if (fallback) {
        return {
          generated_at: generatedAt,
          summary_dir: summaryDirRelative,
          latest: fallback.latest,
          history: fallback.history,
        };
      }
      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: buildSmokeStatusSkeleton("missing", "MISSING"),
        history,
      };
    }

    const latestFileName = summaryFiles[summaryFiles.length - 1];
    const latestPath = path.join(roots.summary_dir_abs, latestFileName);
    const latestTimestamp = parseSmokeTimestampFromName(latestFileName);
    const latestPathRelative = path.posix.join(summaryDirRelative, latestFileName);

    try {
      const raw = await readFile(latestPath, "utf-8");
      const parsed = safeJsonParse(raw);
      if (!isRecord(parsed)) {
        return {
          generated_at: generatedAt,
          summary_dir: summaryDirRelative,
          latest: buildSmokeStatusSkeleton("invalid", "INVALID", {
            timestamp_utc: latestTimestamp,
            path: latestPathRelative,
            parse_error: "invalid-json-structure",
          }),
          history,
        };
      }

      const sourceObj = isRecord(parsed.sources) ? parsed.sources : {};
      const perfObj = isRecord(parsed.perf) ? parsed.perf : {};
      const forensicsObj = isRecord(parsed.forensics) ? parsed.forensics : {};

      const resultRaw = String(parsed.result ?? "").trim().toUpperCase();
      const result: SmokeResult =
        resultRaw === "PASS"
          ? "PASS"
          : resultRaw === "FAIL"
            ? "FAIL"
            : "INVALID";
      const ok = Boolean(parsed.ok);

      const status: SmokeStatusFlag =
        result === "PASS" && ok
          ? "pass"
          : result === "FAIL" || (result === "PASS" && !ok)
            ? "fail"
            : "invalid";

      const timestampUtcCandidate = String(
        parsed.timestamp_utc ?? latestTimestamp,
      )
        .trim()
        .toUpperCase();
      const timestampUtc = /^(\d{8}T\d{6}Z)$/.test(timestampUtcCandidate)
        ? timestampUtcCandidate
        : latestTimestamp;
      const timestampMs = parseSmokeTimestampUtcMs(timestampUtc);
      const ageSec =
        timestampMs === null
          ? null
          : Math.max(0, Math.round((Date.now() - timestampMs) / 1000));

      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: {
          status,
          result,
          ok: status === "pass",
          timestamp_utc: timestampUtc,
          age_sec: ageSec,
          path: latestPathRelative,
          sources: {
            perf_report: normalizeSmokePath(sourceObj.perf_report),
            forensics_report: normalizeSmokePath(sourceObj.forensics_report),
          },
          perf: {
            ok: Boolean(perfObj.ok),
            agent_runtime_sec: parseNullableNumber(perfObj.agent_runtime_sec),
            provider_sessions_30_sec: parseNullableNumber(
              perfObj.provider_sessions_30_sec,
            ),
            threads_60_sec: parseNullableNumber(perfObj.threads_60_sec),
            threads_160_sec: parseNullableNumber(perfObj.threads_160_sec),
          },
          forensics: {
            result: String(forensicsObj.result ?? "").trim().toUpperCase(),
            analyze_status: parseNullableNumber(forensicsObj.analyze_status),
            cleanup_status: parseNullableNumber(forensicsObj.cleanup_status),
            cleanup_token_valid:
              typeof forensicsObj.cleanup_token_valid === "boolean"
                ? forensicsObj.cleanup_token_valid
                : null,
          },
          parse_error: "",
        },
        history,
      };
    } catch (error) {
      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: buildSmokeStatusSkeleton("invalid", "INVALID", {
          timestamp_utc: latestTimestamp,
          path: latestPathRelative,
          parse_error: String(error),
        }),
        history,
      };
    }
  };

  if (!useDefaultRoots) {
    return compute();
  }

  const inflight = compute()
    .then((data) => {
      smokeStatusCache.set(historyLimit, {
        expires_at: Date.now() + SMOKE_STATUS_CACHE_TTL_MS,
        data,
      });
      return data;
    })
    .finally(() => {
      smokeStatusInflight.delete(historyLimit);
    });
  smokeStatusInflight.set(historyLimit, inflight);
  return inflight;
}
