import * as React from "react";

type PanelProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>;

export function Panel({ children, className, ...rest }: PanelProps) {
  const cls = ["panel", className].filter(Boolean).join(" ");
  return (
    <section className={cls} {...rest}>
      {children}
    </section>
  );
}
