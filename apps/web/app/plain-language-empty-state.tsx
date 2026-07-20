"use client";

import Link from "next/link";
import { Button } from "@scc-health/ui";

/** Every empty state states what the page does, what's needed, and offers
 * one primary action -- never a bare "Nothing selected yet" filling a
 * bordered panel (docs/design/product-wide-flow-simplification-research.md).
 * Most "no selection yet" states disappear entirely under the redesigned
 * flows (the question that needs an answer is simply asked first); this
 * remains for genuine empty-result cases (no matches, no data for this
 * combination of filters). */
export function PlainLanguageEmptyState({
  message,
  actionLabel,
  onAction,
  actionHref,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}) {
  return (
    <div className="py-1">
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)]"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <div className="mt-3">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
