import { useMemo } from "react";
import type { useProvidersPanelState } from "@/features/providers/hooks/useProvidersPanelState";
import type { ProvidersPanelProps } from "@/features/providers/components/ProvidersPanel";
import { useProvidersPanelDerived } from "@/features/providers/hooks/useProvidersPanelDerived";
import {
  resolveSessionPanelHeight,
  useProvidersPanelInteractions,
} from "@/features/providers/hooks/useProvidersPanelInteractions";

export { resolveSessionPanelHeight };

export function useProvidersPanelModel(options: {
  props: ProvidersPanelProps;
  state: ReturnType<typeof useProvidersPanelState>;
}) {
  const derived = useProvidersPanelDerived(options);
  const interactions = useProvidersPanelInteractions({
    ...options,
    derived,
  });

  return useMemo(
    () => ({
      sourceFilterOptions: derived.sourceFilterOptions,
      canOpenProviderById: derived.canOpenProviderById,
      canApplySlowOnly: derived.canApplySlowOnly,
      effectiveSlowOnly: derived.effectiveSlowOnly,
      workbenchModel: derived.workbenchModel,
      sessionModel: derived.sessionModel,
      parserModel: derived.parserModel,
      flowModel: derived.flowModel,
      presentationModel: {
        ...derived.presentationModel,
        hotspotOriginLabel: interactions.hotspotOriginLabel,
      },
      actions: interactions.actions,
      constants: derived.constants,
    }),
    [derived, interactions],
  );
}
