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
import type { ProviderSessionAction } from "../domains/providers/types.js";
import { findProviderCapability } from "@threadlens/shared-contracts";

export type * from "../domains/providers/types.js";
export type { ProviderAdapter } from "../domains/providers/adapters.js";

export {
  getProviderAdapter,
  listProviderAdapters,
} from "../domains/providers/adapters.js";

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

function supportsProviderAction(
  provider: ProviderId,
  action: ProviderSessionAction,
): boolean {
  const capability = findProviderCapability(provider);
  if (!capability) {
    return false;
  }
  if (action === "backup_local") {
    return capability.read_sessions === true;
  }
  if (action === "delete_local") {
    return (
      capability.safe_cleanup === true &&
      capability.hard_delete === true
    );
  }
  return capability.safe_cleanup === true;
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
