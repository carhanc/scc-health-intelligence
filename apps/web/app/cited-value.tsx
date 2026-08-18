import type { ReactNode } from "react";
import type { SourceStatusEntry } from "@/lib/api";

/**
 * Wraps a raw metric value in a direct link to its real source landing
 * page -- so the number itself, not just the citation sentence below it,
 * is one click away from "where did this come from" (Health Advocacy
 * Commission feedback: numbers and their sources read as disconnected).
 * Falls back to the plain value, unlinked, when no source resolves --
 * never a link to nowhere.
 */
export function CitedValue({
  sourceId,
  sourcesById,
  children,
}: {
  sourceId: string;
  sourcesById: Map<string, SourceStatusEntry>;
  children: ReactNode;
}) {
  const source = sourcesById.get(sourceId);
  if (!source) return <>{children}</>;
  return (
    <a
      href={source.landing_page}
      target="_blank"
      rel="noreferrer noopener"
      title={`Source: ${source.publisher} (${source.source_vintage}) -- opens the original data source`}
      className="underline decoration-dotted decoration-[var(--color-text-tertiary)] underline-offset-2 hover:text-[var(--color-interactive)] hover:decoration-[var(--color-interactive)]"
    >
      {children}
    </a>
  );
}
