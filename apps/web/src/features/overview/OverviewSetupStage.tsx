import { lazy, Suspense } from "react";
import { useLocale } from "../../i18n";
import type { SetupWizardProps } from "./SetupWizard";

const SetupWizard = lazy(async () => {
  const mod = await import("./SetupWizard");
  return { default: mod.SetupWizard };
});

export function OverviewSetupStage(props: SetupWizardProps) {
  const { messages } = useLocale();
  return (
    <Suspense
      fallback={
        <div className="info-box compact">
          <strong>{messages.common.loading}</strong>
        </div>
      }
    >
      <SetupWizard {...props} />
    </Suspense>
  );
}
