import * as React from "react";

type ChipProps = {
  children: React.ReactNode;
  active?: boolean;
  interactive?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

export function Chip({
  children,
  active = false,
  interactive = true,
  className,
  ...rest
}: ChipProps) {
  const cls = [
    "provider-chip",
    active ? "is-active" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!interactive) {
    return <span className={cls}>{children}</span>;
  }

  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
