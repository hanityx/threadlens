import * as React from "react";

type DisclosureProps = {
  /** Static heading text for the summary */
  label: React.ReactNode;
  /** Body content revealed when expanded */
  children: React.ReactNode;
  /** Controlled open state (optional) */
  open?: boolean;
  /** Called when toggle is clicked */
  onToggle?: (open: boolean) => void;
  className?: string;
};

export function Disclosure({
  label,
  children,
  open,
  onToggle,
  className,
}: DisclosureProps) {
  const cls = ["detail-section", className].filter(Boolean).join(" ");

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    onToggle?.((e.target as HTMLDetailsElement).open);
  };

  return (
    <details className={cls} open={open} onToggle={handleToggle}>
      <summary>{label}</summary>
      <div className="detail-section-body">{children}</div>
    </details>
  );
}
