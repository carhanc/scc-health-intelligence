import type { ReactNode } from "react";

/** Standardizes the "How is this calculated?" disclosure pattern that
 * appeared with slightly different markup in a few places -- a native
 * `<details>` (keyboard- and screen-reader-native for free, matching
 * design-system.md §8's disclosure convention) with a fixed summary
 * label so it's recognizable wherever it appears. */
export function HowCalculatedDisclosure({ children }: { children: ReactNode }) {
  return (
    <details className="mt-2 text-xs text-[var(--color-text-secondary)]">
      <summary className="cursor-pointer font-medium text-[var(--color-interactive)]">
        How is this calculated?
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}
