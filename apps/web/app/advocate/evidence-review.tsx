"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackendWakeState, ErrorState } from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem } from "@/lib/api";
import { dataStatusDefinition, dataStatusLabel } from "@/lib/advocacy-terms";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";
import type { SelectedGeography } from "../explore/selection";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";

/** Which evidence categories a cross-page "Add to advocacy project" click
 * from a given source page is really about -- used only to decide which
 * unselected items appear first, under "Added from <page>," never to
 * fabricate a fact the platform didn't already return. */
const SOURCE_PAGE_CATEGORIES: Record<string, string[]> = {
  Explore: ["scenario_score", "metric"],
  Prioritize: ["scenario_score", "metric"],
  "Access Lab": ["access"],
  Utilization: ["utilization"],
};

const RECOMMENDED_CAP = 5;

/**
 * Evidence step: "What facts would you like to use?" -- shows a small
 * recommended set by default (never the full technical inventory), with
 * "See more evidence" for the rest (docs/design/advocate-flow-
 * simplification-visual-review.md "EVIDENCE STEP"). Selection state
 * (including order) lives in the parent project's `selectedEvidenceIds`
 * array, not here, so it survives a save/reload.
 */
export function EvidenceReview({
  selectedGeography,
  selectedScenarioId,
  selectedEvidenceIds,
  sourcePage,
  onToggleEvidence,
  onEvidenceLoaded,
}: {
  selectedGeography: SelectedGeography | null;
  selectedScenarioId: string;
  selectedEvidenceIds: string[];
  sourcePage: string | null;
  onToggleEvidence: (item: AdvocacyEvidenceItem) => void;
  onEvidenceLoaded: (items: AdvocacyEvidenceItem[]) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const isCustom = selectedScenarioId === CUSTOM_SCENARIO_ID;
  const scenarioParam = isCustom ? undefined : selectedScenarioId;

  const query = useQuery({
    queryKey: [
      "advocate-evidence",
      selectedGeography?.geographyType,
      selectedGeography?.geoid,
      scenarioParam,
    ],
    queryFn: () =>
      api.getAdvocateEvidence(selectedGeography!.geographyType, selectedGeography!.geoid, scenarioParam),
    enabled: !!selectedGeography,
    retry: 1,
  });

  useEffect(() => {
    if (query.data) onEvidenceLoaded(query.data.items);
  }, [query.data]);

  if (!selectedGeography) return null;

  if (query.isLoading) {
    return <BackendWakeState isLoading skeletonLines={5} />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Evidence unavailable"
        description={
          query.error instanceof ApiError ? query.error.message : "Couldn't load evidence for this place."
        }
      />
    );
  }
  if (!query.data) return null;

  const itemsById = new Map(query.data.items.map((item) => [item.evidence_id, item]));
  const selectedItems = selectedEvidenceIds
    .map((id) => itemsById.get(id))
    .filter((item): item is AdvocacyEvidenceItem => item !== undefined);
  const unselected = query.data.items.filter((item) => !selectedEvidenceIds.includes(item.evidence_id));

  const priorityCategories = sourcePage ? (SOURCE_PAGE_CATEGORIES[sourcePage] ?? []) : [];
  const fromSourcePage = unselected.filter((item) => priorityCategories.includes(item.category));
  const rest = unselected.filter((item) => !priorityCategories.includes(item.category));
  const ordered = [...fromSourcePage, ...rest];

  const recommended = ordered.slice(0, RECOMMENDED_CAP);
  const more = ordered.slice(RECOMMENDED_CAP);
  const recommendedFromSourcePage = recommended.filter((item) => priorityCategories.includes(item.category));
  const recommendedOther = recommended.filter((item) => !priorityCategories.includes(item.category));

  return (
    <div className="space-y-6">
      {selectedItems.length > 0 && (
        <EvidenceGroup heading={ADVOCACY_TERMS.evidenceSelectedHeading}>
          {selectedItems.map((item) => (
            <EvidenceCard key={item.evidence_id} item={item} isSelected onToggle={() => onToggleEvidence(item)} />
          ))}
        </EvidenceGroup>
      )}

      {recommendedFromSourcePage.length > 0 && (
        <EvidenceGroup heading={`${ADVOCACY_TERMS.addedFromPrefix} ${sourcePage}`}>
          {recommendedFromSourcePage.map((item) => (
            <EvidenceCard key={item.evidence_id} item={item} isSelected={false} onToggle={() => onToggleEvidence(item)} />
          ))}
        </EvidenceGroup>
      )}

      {recommendedOther.length > 0 && (
        <EvidenceGroup heading={ADVOCACY_TERMS.recommendedFactsHeading}>
          {recommendedOther.map((item) => (
            <EvidenceCard key={item.evidence_id} item={item} isSelected={false} onToggle={() => onToggleEvidence(item)} />
          ))}
        </EvidenceGroup>
      )}

      {!showMore && more.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
        >
          {ADVOCACY_TERMS.seeMoreEvidenceCta}
        </button>
      )}
      {showMore && more.length > 0 && (
        <EvidenceGroup heading={ADVOCACY_TERMS.seeMoreEvidenceCta}>
          {more.map((item) => (
            <EvidenceCard key={item.evidence_id} item={item} isSelected={false} onToggle={() => onToggleEvidence(item)} />
          ))}
        </EvidenceGroup>
      )}

      {query.data.items.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          No facts are available for this place yet.
        </p>
      )}
    </div>
  );
}

function EvidenceGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">{heading}</h3>
      <ul className="mt-2 space-y-2">
        {Array.isArray(children)
          ? children.map((child, i) => <li key={i}>{child}</li>)
          : children}
      </ul>
    </div>
  );
}

function EvidenceCard({
  item,
  isSelected,
  onToggle,
}: {
  item: AdvocacyEvidenceItem;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border p-4 ${
        isSelected ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]" : "border-[var(--color-border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.label}</p>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{item.value}</p>
          <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
            Source: {item.publisher}
            {" · "}
            <span title={dataStatusDefinition(item.data_status)}>{dataStatusLabel(item.data_status)}</span>
            {item.limitation && ` · ${item.limitation}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={isSelected}
          aria-label={`${isSelected ? "Included" : "Include"} ${item.label}`}
          className={`flex-none rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            isSelected
              ? "bg-[var(--color-interactive)] text-[var(--color-text-on-interactive)]"
              : "border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          }`}
        >
          {isSelected ? "Included ✓" : "Include"}
        </button>
      </div>
    </div>
  );
}
