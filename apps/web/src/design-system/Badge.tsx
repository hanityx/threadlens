import * as React from "react";

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  const cls = ["detail-hero-pill", className].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}
