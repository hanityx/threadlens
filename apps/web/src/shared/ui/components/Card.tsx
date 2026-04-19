import * as React from "react";

export type CardVariant = "default" | "primary" | "review" | "mini" | "kpi";

type CardProps = {
  variant?: CardVariant;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const variantClass: Record<CardVariant, string> = {
  default: "",
  primary: "is-primary",
  review: "is-review",
  mini: "is-mini",
  kpi: "",
};

export function Card({
  variant = "default",
  children,
  className,
  ...rest
}: CardProps) {
  const baseClass = variant === "kpi" ? "kpi-card" : "overview-insight-card";
  const cls = [baseClass, variantClass[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cls} {...rest}>
      {children}
    </article>
  );
}

type CardTitleProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardTitle({ children, className }: CardTitleProps) {
  return <strong className={className}>{children}</strong>;
}

type CardDescriptionProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardDescription({ children, className }: CardDescriptionProps) {
  return <p className={className}>{children}</p>;
}
