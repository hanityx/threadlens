import { lazy, Suspense } from "react";
import type { SetupWizardProps } from "./SetupWizard";

const SetupWizard = lazy(async () => {
  const mod = await import("./SetupWizard");
  return { default: mod.SetupWizard };
});

export function OverviewSetupStage(props: SetupWizardProps) {
  return (
    <Suspense
      fallback={
        <div className="info-box compact">
          <strong>Loading</strong>
          <p>Loading setup stage.</p>
        </div>
      }
    >
      <SetupWizard {...props} />
    </Suspense>
  );
}
