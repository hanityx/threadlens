import { lazy, Suspense } from "react";
import { SurfaceSlotSkeleton } from "@/app/components/SurfaceSlotSkeleton";
import { useLocale } from "@/i18n";
import type { SetupWizardProps } from "@/features/overview/components/SetupWizard";

const SetupWizard = lazy(async () => {
  const mod = await import("./SetupWizard");
  return { default: mod.SetupWizard };
});

export function OverviewSetupStage(props: SetupWizardProps) {
  useLocale();
  return <Suspense fallback={<SurfaceSlotSkeleton />}><SetupWizard {...props} /></Suspense>;
}
