import * as React from "react";

export type StatusPillVariant = "active" | "detected" | "missing" | "preview";

type StatusPillProps = {
  variant: StatusPillVariant;
  children: React.ReactNode;
  /** Render as a clickable button */
  interactive?: boolean;
  /** Optional trailing action label */
  action?: React.ReactNode;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

const variantClass: Record<StatusPillVariant, string> = {
  active: "status-active",
  detected: "status-detected",
  missing: "status-missing",
  preview: "status-preview",
};

export function StatusPill({
  variant,
  children,
  interactive = false,
  action,
  className,
  ...rest
}: StatusPillProps) {
  const cls = [
    "status-pill",
    variantClass[variant],
    interactive ? "status-pill-button" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <button type="button" className={cls} {...rest}>
        {children}
        {action ? <span className="status-pill-action">{action}</span> : null}
      </button>
    );
  }

  return (
    <span className={cls}>
      {children}
      {action ? <span className="status-pill-action">{action}</span> : null}
    </span>
  );
}
