import type { ReactNode } from "react";

/** Used sparingly, per docs/01 §18: "Information hierarchy should come
 * from spacing, typography, and grouping rather than floating cards
 * everywhere." Reach for a plain section with spacing before reaching
 * for this. */
export function Card({
  children,
  className = "",
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Component
      className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${className}`}
    >
      {children}
    </Component>
  );
}
