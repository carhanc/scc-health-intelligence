import type { ReactNode } from "react";

/** Standardizes the h1 + one-sentence purpose statement every primary
 * page opens with, so the "what is this page for" answer (30-second
 * comprehension objective, docs/design/health-equity-ux-redesign.md §5)
 * is always in the same place, same size, same tag. */
export function PageIntro({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-medium leading-[1.1] text-[var(--color-text-primary)] sm:text-[2.5rem]">{title}</h1>
      <p className="mt-3 text-lg text-[var(--color-text-secondary)]">{children}</p>
    </div>
  );
}
