"use client";

import type { SelectedGeography } from "./selection";
import { PlaceSearch } from "../map-home/place-search";

/**
 * The place search used by Access Lab, Advocate and Copilot: the same
 * type-ahead as the map page (suggestions appear as you type, arrow keys and
 * Enter work), so there is one way to find a place everywhere.
 */
export function SearchPanel({
  onSelect,
  compact = false,
}: {
  onSelect: (selection: SelectedGeography) => void;
  /** Kept for existing callers; the search no longer repeats helper copy. */
  selected?: SelectedGeography | null;
  compact?: boolean;
  showMapHint?: boolean;
}) {
  return (
    <div className="max-w-xl">
      {!compact && (
        <p className="mb-2.5 text-sm text-[var(--color-text-secondary)]">
          Search a city, ZIP code, supervisor district, or census tract number.
        </p>
      )}
      <PlaceSearch onSelect={onSelect} />
    </div>
  );
}
