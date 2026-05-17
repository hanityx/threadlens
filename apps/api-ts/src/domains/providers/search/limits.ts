import type { ProviderId } from "../types.js";
import {
  DEFAULT_CONVERSATION_SEARCH_LIMIT,
  DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR,
  DEFAULT_CONVERSATION_SEARCH_SCAN_MULTIPLIER,
  MAX_CONVERSATION_SEARCH_LIMIT,
  MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  PROVIDER_SCAN_BUDGET_WEIGHTS,
} from "./constants.js";

export function resolveConversationSearchLimits(options?: {
  limit?: number;
  sessionLimitPerProvider?: number;
}) {
  const resultLimit = Math.max(
    1,
    Math.min(
      MAX_CONVERSATION_SEARCH_LIMIT,
      Number(options?.limit) || DEFAULT_CONVERSATION_SEARCH_LIMIT,
    ),
  );
  const scanLimit = Math.max(
    DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR,
    Math.min(
      MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
      Number(options?.sessionLimitPerProvider) ||
        Math.max(
          resultLimit * DEFAULT_CONVERSATION_SEARCH_SCAN_MULTIPLIER,
          DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR,
        ),
    ),
  );
  return {
    resultLimit,
    scanLimit,
  };
}

export function buildConversationSearchProviderBudgets(
  providers: ProviderId[],
  totalBudget: number,
): Array<{ provider: ProviderId; limit: number }> {
  const uniqueProviders = Array.from(new Set(providers));
  const safeBudget = Math.max(1, Math.floor(totalBudget));
  if (!uniqueProviders.length) return [];
  if (uniqueProviders.length === 1) {
    return [{ provider: uniqueProviders[0], limit: safeBudget }];
  }

  const weightedProviders = uniqueProviders.map((provider) => ({
    provider,
    weight: PROVIDER_SCAN_BUDGET_WEIGHTS[provider] ?? 1,
  }));
  const totalWeight = weightedProviders.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  const provisional = weightedProviders.map((entry) => {
    const exact = (safeBudget * entry.weight) / totalWeight;
    return {
      provider: entry.provider,
      exact,
      limit: Math.max(1, Math.floor(exact)),
    };
  });

  let remaining = safeBudget - provisional.reduce((sum, entry) => sum + entry.limit, 0);
  provisional
    .sort((a, b) => (b.exact - b.limit) - (a.exact - a.limit))
    .forEach((entry) => {
      if (remaining <= 0) return;
      entry.limit += 1;
      remaining -= 1;
    });

  const limitByProvider = new Map(
    provisional.map((entry) => [entry.provider, entry.limit] as const),
  );
  return uniqueProviders.map((provider) => ({
    provider,
    limit: limitByProvider.get(provider) ?? 1,
  }));
}
