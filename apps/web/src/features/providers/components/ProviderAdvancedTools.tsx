import type { ComponentProps, ReactNode } from "react";
import { AiManagementMatrix } from "@/features/providers/components/AiManagementMatrix";
import { DataSourcesList } from "@/features/providers/components/DataSourcesList";
import { ProviderAdvancedShell } from "@/features/providers/components/ProviderAdvancedShell";
import "./providerAdvanced.css";

export function ProviderAdvancedTools(props: {
  advancedShellProps: Omit<ComponentProps<typeof ProviderAdvancedShell>, "matrixSlot">;
  matrixProps: Omit<ComponentProps<typeof AiManagementMatrix>, "dataSourcesSlot">;
  dataSourcesListProps: ComponentProps<typeof DataSourcesList>;
  diagnosticsSlot?: ReactNode;
}) {
  const {
    advancedShellProps,
    matrixProps,
    dataSourcesListProps,
    diagnosticsSlot,
  } = props;

  return (
    <div className="provider-routing-tools-row">
      <ProviderAdvancedShell
        {...advancedShellProps}
        matrixSlot={
          <AiManagementMatrix
            {...matrixProps}
            dataSourcesSlot={<DataSourcesList {...dataSourcesListProps} />}
          />
        }
      />
      {diagnosticsSlot ? (
        <div className="provider-routing-tools-main provider-routing-diagnostics-block">
          {diagnosticsSlot}
        </div>
      ) : null}
    </div>
  );
}
