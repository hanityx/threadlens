/**
 * Compatibility facade for shared API utilities.
 *
 * New code should prefer the focused modules in this directory.
 */

export {
  envelope,
  withSchemaVersion,
} from "./envelope.js";
export {
  fetchWithTimeout,
} from "./http.js";
export {
  safeJsonParse,
  readJsonFile,
} from "./json.js";
export {
  isRecord,
} from "./guards.js";
export {
  nowIsoUtc,
} from "./time.js";
export {
  cleanTitleText,
} from "./text.js";
export {
  parseNumber,
  parseQueryString,
  parseQueryNumber,
  canonicalizeQuery,
} from "./query.js";
export type {
  QueryMap,
} from "./query.js";
export {
  runCmdText,
  getTmuxSessions,
} from "./process.js";
export {
  pathExists,
  readFileHead,
  readHeadLines,
  readFileTail,
  walkFiles,
  walkFilesByExt,
  countDirsWithPrefix,
  quickFileCount,
  countJsonlFilesRecursive,
  countFilesRecursiveByExt,
  matchesPattern,
  scanPathStatsTs,
} from "./fs.js";
export {
  bulkRequestSchema,
} from "./schemas.js";
