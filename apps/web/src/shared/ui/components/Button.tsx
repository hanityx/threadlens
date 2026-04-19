import * as React from "react";

export type ButtonVariant = "outline" | "accent" | "danger" | "base";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "outline", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={["btn-" + variant, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
