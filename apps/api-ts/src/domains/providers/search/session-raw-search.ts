import type { ProviderSessionRow } from "../types.js";
import {
  type RawConversationFileMatch,
  type RawConversationFileSearchLoader,
  searchConversationFilesWithRipgrep,
} from "./raw-files.js";
import type { ConversationTranscriptLoader } from "./types.js";

export type ConversationRawFileSearchState = {
  rawFileMatches: Map<string, RawConversationFileMatch>;
  rawFileSearchComplete: boolean;
};

export async function loadConversationRawFileMatches(
  rows: ProviderSessionRow[],
  q: string,
  options: {
    metadataOnlyQuery: boolean;
    transcriptLoader?: ConversationTranscriptLoader;
    previewHitsPerSession?: number;
    rawFileSearchLoader?: RawConversationFileSearchLoader;
    signal?: AbortSignal;
  },
): Promise<ConversationRawFileSearchState> {
  const shouldUseRawFileSearch =
    !options.metadataOnlyQuery &&
    (Boolean(options.rawFileSearchLoader) || !options.transcriptLoader);
  if (!shouldUseRawFileSearch) {
    return {
      rawFileMatches: new Map(),
      rawFileSearchComplete: false,
    };
  }

  try {
    const rawFileMatches = await (
      options.rawFileSearchLoader ?? searchConversationFilesWithRipgrep
    )(rows, q, {
      previewHitsPerSession: options.previewHitsPerSession,
      signal: options.signal,
    });
    return {
      rawFileMatches,
      rawFileSearchComplete: true,
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return {
      rawFileMatches: new Map(),
      rawFileSearchComplete: false,
    };
  }
}
