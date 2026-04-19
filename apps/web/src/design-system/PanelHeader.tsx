import * as React from "react";

type PanelHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
};

export function PanelHeader({ title, subtitle, actions }: PanelHeaderProps) {
  return (
    <header className="panel-header">
      <div className="panel-header-copy">
        <h2 className="panel-header-title">{title}</h2>
        {subtitle ? <span className="panel-header-subtitle">{subtitle}</span> : null}
      </div>
      {actions ? <div className="panel-header-actions">{actions}</div> : null}
    </header>
  );
}
