import { FreshnessBadge } from "@scc-health/ui";
import type { SourceStatusEntry } from "@/lib/api";

/**
 * The single citation renderer for a number tied to a real source_id --
 * a publisher name linked to its real landing page, its vintage, and a
 * freshness badge, resolved from the same manifest-level source list the
 * Data page renders (useSourcesById). A Health Advocacy Commission
 * review found every page invented its own citation format (a prose
 * parenthetical here, a chart caption there, nothing at all elsewhere),
 * and that only the Data page's own table ever linked to a source's real
 * landing page -- this component is the fix, reused everywhere a number
 * has a real source_id: falls back to a plain, still-complete citation
 * sentence while the source list is loading or on a genuine lookup miss,
 * so there is no broken or misleading intermediate state.
 */
export function SourceCitationLine({
  sourceId,
  fallbackText,
  sourcesById,
}: {
  sourceId: string;
  fallbackText: string;
  sourcesById: Map<string, SourceStatusEntry>;
}) {
  const source = sourcesById.get(sourceId);
  if (!source) {
    return <span>{fallbackText}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <a
        href={source.landing_page}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-[var(--color-interactive)] underline underline-offset-2"
      >
        {source.publisher}
      </a>
      <span>&middot; {source.source_vintage}</span>
      <FreshnessBadge state={source.freshness_state} />
    </span>
  );
}
