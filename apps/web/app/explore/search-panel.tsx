"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingRegion, SkeletonText, DataModeBadge } from "@scc-health/ui";
import { api, ApiError, type GeographyType } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "./selection";

const TYPE_LABEL: Record<GeographyType, string> = {
  tract: "Census tract",
  place: "City / place",
  zcta: "ZIP Code Tabulation Area (ZCTA -- not the same as a ZIP code)",
  county: "County",
  supervisor_district: "Supervisor district",
};

export function SearchPanel({
  onSelect,
  selected,
  compact = false,
  showMapHint = true,
}: {
  onSelect: (selection: SelectedGeography) => void;
  selected: SelectedGeography | null;
  /** Once a geography is selected, the sidebar becomes the selected
   * profile -- search must stay reachable ("a compact search affordance
   * at the top," docs/design/health-equity-product-consolidation.md §4)
   * without repeating the full first-time heading and helper copy that
   * State 1 already showed. */
  compact?: boolean;
  /** Explore renders this panel next to an actual map, so "or select any
   * tract directly on the map" is a real, followable instruction there.
   * Advocate's Place step reuses this same component with no map on the
   * page (a blind usability review caught the dead reference) -- callers
   * without a map should pass false. */
  showMapHint?: boolean;
}) {
  const inputId = useId();
  const [inputValue, setInputValue] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const searchQuery = useQuery({
    queryKey: ["geography-search", submittedQuery],
    queryFn: () => api.searchGeographies(submittedQuery),
    enabled: submittedQuery.length > 0,
    retry: 1,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(inputValue.trim());
  }

  return (
    <div>
      <form onSubmit={handleSubmit} role="search">
        <label
          htmlFor={inputId}
          className={compact ? "sr-only" : "block text-sm font-medium text-[var(--color-text-primary)]"}
        >
          Find a place
        </label>
        {!compact && (
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Search a city, a supervisor district, or a census tract number.
          </p>
        )}
        <div className={compact ? "flex gap-2" : "mt-2 flex gap-2"}>
          <input
            id={inputId}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={compact ? "Search another place…" : "e.g. Sunnyvale, District 3, 06085500100"}
            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)]"
          >
            Search
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-4">
        {submittedQuery.length === 0 && !compact && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {showMapHint
              ? "Enter a search term above, or select any tract directly on the map."
              : "Enter a city, ZIP code, supervisor district, or census tract number above."}
          </p>
        )}
        {searchQuery.isLoading && (
          <LoadingRegion label="Searching">
            <SkeletonText lines={3} />
          </LoadingRegion>
        )}
        {searchQuery.isError && (
          <p role="alert" className="text-sm text-[var(--color-alert)]">
            {searchQuery.error instanceof ApiError
              ? `Search unavailable: ${searchQuery.error.message}`
              : "Search is temporarily unavailable. Is the API running?"}
          </p>
        )}
        {searchQuery.data && searchQuery.data.results.length === 0 && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No places matched &ldquo;{submittedQuery}&rdquo;. Try a different city name, district number, or tract
            number.
          </p>
        )}
        {searchQuery.data && searchQuery.data.results.length > 0 && (
          <>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {searchQuery.data.results.length} result{searchQuery.data.results.length === 1 ? "" : "s"} ·{" "}
              <DataModeBadge mode={searchQuery.data.data_mode} />
            </p>
            <ul className="mt-2 max-h-80 divide-y divide-[var(--color-border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {searchQuery.data.results.map((result) => {
                const isSelected =
                  selected?.geographyType === result.geography_type && selected.geoid === result.geography_id;
                return (
                  <li key={`${result.geography_type}-${result.geography_id}`}>
                    <button
                      type="button"
                      disabled={!isValidGeographyId(result.geography_type, result.geography_id)}
                      onClick={() =>
                        onSelect({
                          geographyType: result.geography_type,
                          geoid: result.geography_id,
                          displayName: result.label,
                          source: "search",
                        })
                      }
                      aria-current={isSelected ? "true" : undefined}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] focus-visible:bg-[var(--color-surface-sunken)] aria-[current=true]:bg-[var(--color-interactive-subtle)] aria-[current=true]:font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-[var(--color-text-secondary)]">
                        {TYPE_LABEL[result.geography_type]}
                      </span>
                      <br />
                      {result.label}
                      {result.geography_type === "tract" && (
                        <span className="ml-1.5 tabular-nums text-[var(--color-text-tertiary)]">
                          ({result.geography_id})
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
