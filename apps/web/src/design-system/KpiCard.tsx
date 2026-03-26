import { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export function KpiCard({ label, value, hint }: Props) {
  return (
    <article className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {hint ? <p className="kpi-hint">{hint}</p> : null}
    </article>
  );
}
