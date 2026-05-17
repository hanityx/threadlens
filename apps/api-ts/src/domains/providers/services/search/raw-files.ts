import { spawn } from "node:child_process";

import type { ProviderSessionRow } from "../../types.js";
import {
  buildSearchSnippet,
  buildSearchTokens,
  isExactPhraseSearchMatch,
  matchesConversationSearch,
  normalizeSearchQuery,
  normalizeSearchText,
} from "../../search-helpers.js";
import {
  createAbortError,
  throwIfAborted,
} from "./abort.js";

const RAW_CONVERSATION_FILE_EXT_PATTERN = /\.(jsonl|json|md|txt|data)$/i;
export const RAW_CONVERSATION_FILE_MAX_MATCHES = 10_000;
const RAW_FILE_SEARCH_CHUNK_SIZE = 160;

export type RawConversationFileMatch = {
  snippets: string[];
  match_count: number;
  has_more_hits: boolean;
  exact_phrase_count: number;
};

export type RawConversationFileSearchLoader = (
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    previewHitsPerSession?: number;
    maxHitsPerSession?: number;
    signal?: AbortSignal;
  },
) => Promise<Map<string, RawConversationFileMatch>>;

export function isRawConversationFileSearchEligible(filePath: string): boolean {
  return RAW_CONVERSATION_FILE_EXT_PATTERN.test(filePath);
}

function buildRipgrepPattern(query: string): string | null {
  const trimmedQuery = normalizeSearchText(query);
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const tokens = buildSearchTokens(trimmedQuery);
  if (!normalizedQuery && !tokens.length) return null;
  if (normalizedQuery && tokens.length <= 1) {
    return normalizedQuery;
  }
  if (tokens.length > 0) {
    return tokens[0];
  }
  return normalizedQuery;
}

export async function searchConversationFilesWithRipgrep(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    previewHitsPerSession?: number;
    maxHitsPerSession?: number;
    signal?: AbortSignal;
  },
): Promise<Map<string, RawConversationFileMatch>> {
  const pattern = buildRipgrepPattern(q);
  if (!pattern) return new Map();
  const previewLimit = Math.max(
    1,
    Math.min(
      RAW_CONVERSATION_FILE_MAX_MATCHES,
      Number(options?.previewHitsPerSession) || 3,
    ),
  );
  const maxHitsPerSession = Math.max(
    previewLimit,
    Math.min(
      RAW_CONVERSATION_FILE_MAX_MATCHES,
      Number(options?.maxHitsPerSession) || previewLimit,
    ),
  );
  const maxPerFile = maxHitsPerSession + 1;
  const normalizedQuery = normalizeSearchQuery(q);
  const tokens = buildSearchTokens(q);
  const textRows = rows.filter((row) => isRawConversationFileSearchEligible(row.file_path));
  if (!textRows.length) return new Map();

  const files = textRows.map((row) => row.file_path);
  const matches = new Map<string, RawConversationFileMatch>();
  for (let index = 0; index < files.length; index += RAW_FILE_SEARCH_CHUNK_SIZE) {
    throwIfAborted(options?.signal);
    const chunk = files.slice(index, index + RAW_FILE_SEARCH_CHUNK_SIZE);
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          "rg",
          [
            "--json",
            "-F",
            "-i",
            "-m",
            String(maxPerFile),
            pattern,
            "--",
            ...chunk,
          ],
          {
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let out = "";
        let err = "";
        const abortHandler = () => {
          child.kill("SIGTERM");
          reject(createAbortError());
        };
        options?.signal?.addEventListener("abort", abortHandler, { once: true });
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (data) => {
          out += data;
        });
        child.stderr.on("data", (data) => {
          err += data;
        });
        child.on("error", (error) => {
          options?.signal?.removeEventListener("abort", abortHandler);
          reject(error);
        });
        child.on("close", (code) => {
          options?.signal?.removeEventListener("abort", abortHandler);
          if (code === 0 || code === 1) {
            resolve(out);
            return;
          }
          reject(new Error(err || `rg exited with code ${String(code)}`));
        });
      });

      for (const line of stdout.split(/\r?\n/)) {
        throwIfAborted(options?.signal);
        if (!line.trim()) continue;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (!event || typeof event !== "object") continue;
        const parsed = event as {
          type?: string;
          data?: {
            path?: { text?: string };
            lines?: { text?: string };
          };
        };
        if (parsed.type !== "match") continue;
        const filePath = parsed.data?.path?.text;
        const rawLine = parsed.data?.lines?.text;
        if (!filePath || !rawLine) continue;
        if (!matchesConversationSearch(rawLine, normalizedQuery, tokens)) continue;
        const current = matches.get(filePath) ?? {
          snippets: [],
          match_count: 0,
          has_more_hits: false,
          exact_phrase_count: 0,
        };
        current.match_count += 1;
        if (isExactPhraseSearchMatch(rawLine, normalizedQuery)) {
          current.exact_phrase_count += 1;
        }
        if (current.snippets.length < maxHitsPerSession) {
          const snippet = buildSearchSnippet(rawLine, normalizedQuery, tokens);
          if (snippet && !current.snippets.includes(snippet)) {
            current.snippets.push(snippet);
          }
        }
        if (current.match_count > maxHitsPerSession) {
          current.has_more_hits = true;
        }
        matches.set(filePath, current);
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      const failure = error as { code?: number };
      if (failure.code === 1) continue;
      throw error;
    }
  }

  return matches;
}
