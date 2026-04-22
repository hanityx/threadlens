import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  LayoutView,
  RecoveryResponse,
  RuntimeEnvelope,
  SmokeStatusEnvelope,
} from "@/shared/types";
import { apiGet } from "@/api";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  buildRecoveryCenterPath,
  normalizeRecoveryBackupRoot,
  RECOVERY_BACKUP_ROOT_DEBOUNCE_MS,
  resolveQueryLoadingState,
  resolveRecoveryQueryState,
  resolveSmokeStatusQueryState,
} from "@/app/hooks/useMutationCore";

export function useMutationQueries(layoutView: LayoutView, backupRoot: string) {
  const normalizedBackupRoot = normalizeRecoveryBackupRoot(backupRoot);
  const [debouncedBackupRoot, setDebouncedBackupRoot] = useState(normalizedBackupRoot);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedBackupRoot(normalizedBackupRoot);
    }, RECOVERY_BACKUP_ROOT_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [normalizedBackupRoot]);

  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: ({ signal }) => apiGet<RuntimeEnvelope>("/api/agent-runtime", { signal }),
    refetchInterval: 20000,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const smokeStatusQueryState = resolveSmokeStatusQueryState(layoutView);
  const smokeStatus = useQuery({
    queryKey: ["smoke-status"],
    queryFn: ({ signal }) => apiGet<SmokeStatusEnvelope>("/api/smoke-status?limit=6", { signal }),
    enabled: smokeStatusQueryState.enabled,
    refetchInterval: smokeStatusQueryState.refetchInterval,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const recoveryQueryState = resolveRecoveryQueryState(layoutView);
  const recovery = useQuery({
    queryKey: ["recovery", debouncedBackupRoot],
    queryFn: ({ signal }) =>
      apiGet<RecoveryResponse>(buildRecoveryCenterPath(debouncedBackupRoot), { signal }),
    enabled: recoveryQueryState.enabled,
    refetchInterval: recoveryQueryState.refetchInterval,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const smokeStatusRoot =
    extractEnvelopeData<NonNullable<SmokeStatusEnvelope["data"]>>(smokeStatus.data) ?? {};

  return {
    runtime,
    smokeStatus,
    recovery,
    smokeStatusLatest: smokeStatusRoot.latest,
    runtimeLoading: resolveQueryLoadingState(runtime.isLoading, Boolean(runtime.data)),
    smokeStatusLoading: resolveQueryLoadingState(
      smokeStatus.isLoading,
      Boolean(smokeStatus.data),
    ),
    recoveryLoading: resolveQueryLoadingState(recovery.isLoading, Boolean(recovery.data)),
  };
}
