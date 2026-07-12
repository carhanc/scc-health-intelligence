import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--color-interactive)] text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)] border border-transparent",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]",
  ghost:
    "bg-transparent text-[var(--color-interactive)] border border-transparent hover:bg-[var(--color-interactive-subtle)]",
  danger:
    "bg-[var(--color-alert)] text-[var(--color-text-on-interactive)] hover:opacity-90 border border-transparent",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

/** A single, consistent button primitive -- avoid inventing one-off
 * button styles elsewhere in the app (docs/01 §18 restrained visual
 * language). Disabled state is visually and semantically real
 * (`disabled` attribute), never a click-blocked-looking-enabled button. */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
