export const DEFAULT_PROVIDER_SESSIONS_LIMIT = 240;
export const FILTERED_PROVIDER_SESSIONS_LIMIT = 1000;

export function getSessionsFetchLimit(filterQuery: string): number {
  return filterQuery.trim().length > 0
    ? FILTERED_PROVIDER_SESSIONS_LIMIT
    : DEFAULT_PROVIDER_SESSIONS_LIMIT;
}

export function shouldRefetchSessions(
  providerChanged: boolean,
  fetchedLimit: number,
  filterQuery: string,
): boolean {
  if (providerChanged) return true;
  return getSessionsFetchLimit(filterQuery) > fetchedLimit;
}
