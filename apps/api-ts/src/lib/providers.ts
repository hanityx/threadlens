/**
 * Provider-domain compatibility facade.
 *
 * New code should prefer `src/domains/providers/*`.
 */

import { buildSessionTranscript } from "../domains/providers/transcript.js";
import {
  buildProviderActionToken,
  runProviderSessionAction as runProviderSessionActionInternal,
} from "../domains/providers/actions.js";
import { invalidateProviderSearchCaches } from "../domains/providers/search.js";
import { invalidateProviderMatrixCache } from "../domains/providers/matrix.js";
import { resolveAllowedProviderFilePath } from "../domains/providers/path-safety.js";
import type { ProviderId } from "../domains/providers/types.js";

export type * from "../domains/providers/types.js";

export {
  listProviderIds,
  parseProviderId,
  providerName,
  providerRootSpecs,
  providerScanRootSpecs,
  codexTranscriptSearchRoots,
  isAllowedProviderFilePath,
  isPathInsideRoot,
  resolveSafePathWithinRoots,
  resolveAllowedProviderFilePath,
} from "../domains/providers/path-safety.js";
export {
  inferSessionId,
  isWorkspaceChatSessionPath,
  isCopilotGlobalSessionLikeFile,
  probeSessionFile,
} from "../domains/providers/probe.js";
export {
  invalidateCodexThreadTitleMapCache,
  extractCodexThreadIdFromSessionName,
  normalizeDetectedTitle,
  detectSessionTitleFromHead,
  detectClaudeRenamedTitle,
  getCodexThreadTitleMap,
  fallbackDisplayTitle as buildDisplayTitleFallback,
} from "../domains/providers/title-detection.js";
export {
  providerStatus,
  capabilityLevel,
  invalidateProviderMatrixCache,
  getProviderMatrixTs,
} from "../domains/providers/matrix.js";
export {
  normalizeSearchText,
  normalizeSearchQuery,
  buildSearchTokens,
  matchesConversationSearch,
  buildSearchSnippet,
  fallbackDisplayTitle,
} from "../domains/providers/search-helpers.js";
export { buildProviderActionToken, buildSessionTranscript };

function supportsProviderCleanup(provider: ProviderId): boolean {
  return provider !== "chatgpt";
}

export async function runProviderSessionAction(
  provider: ProviderId,
  action: import("../domains/providers/types.js").ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
  options?: import("../domains/providers/types.js").ProviderSessionActionOptions,
) {
  return runProviderSessionActionInternal(
    {
      resolveAllowedProviderFilePath,
      supportsProviderCleanup,
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
