export type ThreadRouteDeps = {
  invalidateOverviewCache: () => void;
  invalidateProviderSessionCache: (provider: "codex") => void;
};
