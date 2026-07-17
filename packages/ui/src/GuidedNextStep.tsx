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
    <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{prompt}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">{children}</div>
    </div>
  );
}
