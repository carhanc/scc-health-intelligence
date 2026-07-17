"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type AdvocacyEvidenceItem } from "@/lib/api";
import { dataStatusDefinition } from "@/lib/glossary";
import type { SelectedGeography } from "../explore/selection";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";

/**
 * Step 3 ("Review matched evidence") / step 4 ("Select what matters").
 * Fetches the real evidence bundle for the selected geography+scenario
 * and lets the user select, remove, and reorder which items become part
 * of the workspace -- selection state (including order) lives in the
 * parent workspace's `selectedEvidenceIds` array, not here, so it
 * survives a save/reload.
 */
export function EvidenceReview({
  selectedGeography,
  selectedScenarioId,
  selectedEvidenceIds,
  onToggleEvidence,
  onReorderSelected,
  onEvidenceLoaded,
}: {
  selectedGeography: SelectedGeography | null;
  selectedScenarioId: string;
  selectedEvidenceIds: string[];
  onToggleEvidence: (item: AdvocacyEvidenceItem) => void;
  onReorderSelected: (fromIndex: number, toIndex: number) => void;
  onEvidenceLoaded: (items: AdvocacyEvidenceItem[]) => void;
}) {
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

  if (!selectedGeography) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        Choose a place above to see matched evidence.
      </p>
    );
  }
  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading evidence">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
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
  const unselectedItems = query.data.items.filter((item) => !selectedEvidenceIds.includes(item.evidence_id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {query.data.items.length} evidence item(s) found for {query.data.geography_label}.{" "}
        {selectedEvidenceIds.length} selected. <DataModeBadge mode={query.data.data_mode} />
      </p>

      {selectedItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">
            Selected, in export order
          </h3>
          <ul className="mt-1.5 space-y-2">
            {selectedItems.map((item, index) => (
              <li key={item.evidence_id}>
                <EvidenceCard
                  item={item}
                  isSelected
                  onToggle={() => onToggleEvidence(item)}
                  onMoveUp={index > 0 ? () => onReorderSelected(index, index - 1) : undefined}
                  onMoveDown={
                    index < selectedItems.length - 1 ? () => onReorderSelected(index, index + 1) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {unselectedItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">Available evidence</h3>
          <ul className="mt-1.5 space-y-2">
            {unselectedItems.map((item) => (
              <li key={item.evidence_id}>
                <EvidenceCard item={item} isSelected={false} onToggle={() => onToggleEvidence(item)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EvidenceCard({
  item,
  isSelected,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  item: AdvocacyEvidenceItem;
  isSelected: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          aria-label={`Include ${item.label} in this workspace`}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{item.label}</span>
            <Badge
              tone={item.data_status === "modeled" ? "caution" : "neutral"}
              title={dataStatusDefinition(item.data_status)}
            >
              {item.data_status}
            </Badge>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">{item.value}</p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            {item.publisher}, {item.source_vintage}
            {item.limitation && ` -- ${item.limitation}`}
          </p>
        </div>
        {isSelected && (onMoveUp || onMoveDown) && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              aria-label={`Move ${item.label} earlier`}
              className="text-xs text-[var(--color-interactive)] hover:underline disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              aria-label={`Move ${item.label} later`}
              className="text-xs text-[var(--color-interactive)] hover:underline disabled:opacity-30"
            >
              ▼
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
