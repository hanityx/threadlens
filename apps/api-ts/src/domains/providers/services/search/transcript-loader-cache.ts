import {
  transcriptSearchCache,
  transcriptSearchCacheKey,
  trimTranscriptSearchCache,
} from "./cache.js";
import type {
  CachedConversationTranscriptLoader,
  ConversationTranscriptLoader,
} from "./types.js";

export function createCachedConversationTranscriptLoader(
  baseLoader: ConversationTranscriptLoader,
): CachedConversationTranscriptLoader {
  return async (row) => {
    const key = transcriptSearchCacheKey(row);
    const cached = transcriptSearchCache.get(key);
    if (cached && cached.mtime === row.mtime) {
      transcriptSearchCache.delete(key);
      transcriptSearchCache.set(key, cached);
      return cached.transcript;
    }

    const transcript = await baseLoader(row.provider, row.file_path).catch(() => null);
    if (transcript) {
      transcriptSearchCache.set(key, {
        mtime: row.mtime,
        transcript,
      });
      trimTranscriptSearchCache();
    }
    return transcript;
  };
}
