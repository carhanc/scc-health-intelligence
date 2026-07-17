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
      <span className="cursor-help border-b border-dotted border-[var(--color-border-strong)]">
        {children}
      </span>
    </Tooltip>
  );
}
