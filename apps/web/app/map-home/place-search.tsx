"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type GeographyType } from "@/lib/api";
import { isValidGeographyId, type SelectedGeography } from "../explore/selection";

const TYPE_LABEL: Record<GeographyType, string> = {
  tract: "Neighborhood",
  place: "City",
  zcta: "ZIP area",
  county: "County",
  supervisor_district: "District",
};

/** Search as you type, with a keyboard-operable results list (the WAI-ARIA
 * combobox pattern). Replaces the old "type, then press Search" form: the
 * first suggestions appear after two characters, Enter takes the highlighted
 * one (or the first). Matches cities, ZIP areas, supervisor districts and
 * tract numbers. */
export function PlaceSearch({
  onSelect,
  autoFocus = false,
}: {
  onSelect: (selection: SelectedGeography) => void;
  autoFocus?: boolean;
}) {
  const inputId = useId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 180);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const enabled = debounced.length >= 2;
  const query = useQuery({
    queryKey: ["geography-search", debounced],
    queryFn: () => api.searchGeographies(debounced),
    enabled,
    retry: 1,
    staleTime: 60 * 1000,
  });

  const results = enabled ? (query.data?.results ?? []) : [];
  const showList = open && enabled;

  function choose(index: number) {
    const result = results[index];
    if (!result || !isValidGeographyId(result.geography_type, result.geography_id)) return;
    onSelect({
      geographyType: result.geography_type,
      geoid: result.geography_id,
      displayName: result.label,
      source: "search",
    });
    setValue("");
    setDebounced("");
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  }

  return (
    <div className="relative" role="search">
      <label htmlFor={inputId} className="sr-only">
        Find a place
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--color-text-tertiary)]"
        fill="none"
      >
        <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder="Search a city, ZIP, district or tract"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results.length > 0) choose(active >= 0 ? active : 0);
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        className="w-full rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-2.5 pl-11 pr-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-[var(--color-interactive)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-focus-ring)]"
      />

      {showList && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
          {query.isLoading && <p className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">Searching&hellip;</p>}
          {query.isError && (
            <p role="alert" className="px-4 py-3 text-sm text-[var(--color-alert)]">
              {query.error instanceof ApiError
                ? `Search unavailable: ${query.error.message}`
                : "Search is temporarily unavailable."}
            </p>
          )}
          {query.data && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
              Nothing matched &ldquo;{debounced}&rdquo;. Try a city name, a ZIP code, a district number, or a tract
              number.
            </p>
          )}
          {results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Matching places" className="max-h-72 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li
                  key={`${r.geography_type}-${r.geography_id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2.5 text-sm ${
                    i === active ? "bg-[var(--color-interactive-subtle)]" : ""
                  }`}
                >
                  <span className="min-w-0 truncate text-[var(--color-text-primary)]">
                    {r.label}
                    {r.geography_type === "tract" && (
                      <span className="ml-1.5 tabular-nums text-[var(--color-text-tertiary)]">({r.geography_id})</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">{TYPE_LABEL[r.geography_type]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
