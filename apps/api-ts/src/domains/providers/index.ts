import {
  buildProviderActionToken,
  runProviderSessionAction as runProviderSessionActionInternal,
} from "./actions.js";
import { invalidateProviderMatrixCache } from "./matrix.js";
import { resolveAllowedProviderFilePath } from "./path-safety.js";
import { invalidateProviderSearchCaches } from "./search.js";
import { buildSessionTranscript } from "./transcript.js";
import { supportsProviderAction } from "./capabilities.js";
import type { ProviderId, ProviderSessionActionOptions } from "./types.js";

export type * from "./types.js";
export type { ProviderAdapter } from "./registry.js";

export {
  getProviderAdapter,
  listProviderAdapters,
} from "./registry.js";
export {
  listProviderIds,
  listProviderActionProviderIds,
  parseProviderId,
  listSearchableProviderIds,
  parseSearchableProviderId,
  listSessionReadableProviderIds,
  parseSessionReadableProviderId,
  listTranscriptReadableProviderIds,
  parseTranscriptReadableProviderId,
  supportsProviderAction,
} from "./capabilities.js";
export {
  providerName,
  providerRootSpecs,
  providerScanRootSpecs,
  codexTranscriptSearchRoots,
  isAllowedProviderFilePath,
  isPathInsideRoot,
  resolveSafePathWithinRoots,
  resolveAllowedProviderFilePath,
} from "./path-safety.js";
export {
  inferSessionId,
  isWorkspaceChatSessionPath,
  isCopilotGlobalSessionLikeFile,
  probeSessionFile,
} from "./probe.js";
export {
  invalidateCodexThreadTitleMapCache,
  extractCodexThreadIdFromSessionName,
  normalizeDetectedTitle,
  detectSessionTitleFromHead,
  detectClaudeRenamedTitle,
  getCodexThreadTitleMap,
  fallbackDisplayTitle as buildDisplayTitleFallback,
} from "./title-detection.js";
export {
  providerStatus,
  capabilityLevel,
  invalidateProviderMatrixCache,
  getProviderMatrixTs,
} from "./matrix.js";
export {
  normalizeSearchText,
  normalizeSearchQuery,
  buildSearchTokens,
  matchesConversationSearch,
  buildSearchSnippet,
  fallbackDisplayTitle,
} from "./search-helpers.js";
export { buildProviderActionToken, buildSessionTranscript };

export async function runProviderSessionAction(
  provider: ProviderId,
  action: import("./types.js").ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
  options?: ProviderSessionActionOptions,
) {
  return runProviderSessionActionInternal(
    {
      resolveAllowedProviderFilePath,
      supportsProviderAction,
      invalidateProviderCaches: (targetProvider) => {
        invalidateProviderSearchCaches(targetProvider);
        invalidateProviderMatrixCache();
      },
    },
    provider,
    action,
    filePaths,
    dryRun,
    confirmToken,
    options,
  );
}
