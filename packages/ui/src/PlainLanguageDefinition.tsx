import type { ReactNode } from "react";

/** Pairs a term with a one-sentence, always-visible definition -- for
 * terms that need more than a Tooltip can hold without being essential
 * enough to warrant a full HowCalculatedDisclosure. Never hides the
 * definition behind hover/focus alone (docs/design/content-style-guide.md
 * §9: nothing essential is ever hover-only). */
export function PlainLanguageDefinition({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <p className="text-xs text-[var(--color-text-secondary)]">
      <span className="font-medium text-[var(--color-text-primary)]">{term}: </span>
      {children}
    </p>
  );
}
