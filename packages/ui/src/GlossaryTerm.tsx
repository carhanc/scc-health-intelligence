import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

/** Wraps a term with a Tooltip definition -- a thin presentation
 * component; the actual definitions live in one shared glossary data
 * file per app (e.g. `apps/web/lib/glossary.ts`) so a term's wording is
 * written once and reused everywhere it appears, rather than redefined
 * ad hoc per page. */
export function GlossaryTerm({ definition, children }: { definition: string; children: ReactNode }) {
  return (
    <Tooltip label={definition}>
      {/* tabIndex makes this reachable by keyboard even when `children` is
          plain text or a non-interactive element (e.g. a <strong>) --
          without it, Tooltip's own "focus" trigger would never fire, and
          the definition would be effectively hover-only. */}
      <span
        tabIndex={0}
        className="cursor-help border-b border-dotted border-[var(--color-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
      >
        {children}
      </span>
    </Tooltip>
  );
}
