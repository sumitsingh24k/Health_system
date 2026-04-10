import { forwardRef } from "react";
import { cn } from "@/app/lib/classnames";

const BASE_CLASS =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASS = {
  primary: "border-[var(--color-primary)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
  secondary:
    "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
  success: "border-[var(--color-success)] bg-[var(--color-success)] text-white hover:brightness-95",
  ghost: "border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
};

const SIZE_CLASS = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm",
};

export function buttonClassName({ variant = "primary", size = "md", className = "" } = {}) {
  return cn(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size], className);
}

const Button = forwardRef(function Button(
  { variant = "primary", size = "md", className = "", type = "button", asChild: _asChild, ...props },
  ref
) {
  const classes = buttonClassName({ variant, size, className });
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      {...props}
    />
  );
});

export default Button;
