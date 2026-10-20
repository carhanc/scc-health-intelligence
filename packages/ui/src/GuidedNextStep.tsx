import type { ReactNode } from "react";

/** A consistent "what to do next" callout for the end of a result view
 * (a selected geography, a ranked list) -- replaces ad hoc single links
 * with one recognizable pattern pointing toward the next stage of the
 * Discover -> Understand -> Compare -> Prioritize -> Advocate path. */
export function GuidedNextStep({
  prompt,
  children,
}: {
  prompt: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-interactive-subtle)] px-4 py-3.5">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{prompt}</p>
      <div className="mt-2 flex flex-col gap-1.5 text-sm">{children}</div>
    </div>
  );
}
