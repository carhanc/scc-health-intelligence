"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  type GeographyType,
  type PlaceProfile,
  type SupervisorDistrictProfile,
  type TractProfile,
} from "@/lib/api";

/**
 * Phase 2 scope: a genuinely working geography search + profile view wired
 * to the real API (tracts, places, supervisor districts), with truthful
 * loading/empty/error states and URL-persisted selection. This is a
 * developer/functional view, not the final Explore page design -- the
 * full map + insight-drawer experience from docs/01_UX_UI_SPEC.md §5 is
 * built in Phase 5.
 */
export function GeographySearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedType = searchParams.get("type") as GeographyType | null;
  const selectedId = searchParams.get("id");

  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const [submittedQuery, setSubmittedQuery] = useState(searchParams.get("q") ?? "");

  const searchQuery = useQuery({
    queryKey: ["geography-search", submittedQuery],
    queryFn: () => api.searchGeographies(submittedQuery),
    enabled: submittedQuery.length > 0,
    retry: 1,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(inputValue);
    const params = new URLSearchParams(searchParams.toString());
    if (inputValue) {
      params.set("q", inputValue);
    } else {
      params.delete("q");
    }
    params.delete("type");
    params.delete("id");
    router.push(`/explore?${params.toString()}`);
  }

  function selectGeography(type: GeographyType, id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("type", type);
    params.set("id", id);
    router.push(`/explore?${params.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div>
        <form onSubmit={handleSubmit} role="search">
          <label
            htmlFor="geography-search-input"
            className="block text-sm font-medium text-[var(--color-text-primary)]"
          >
            Search a tract GEOID, city name, or supervisor district
          </label>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Address search and additional geography types are added in a
            later phase. Try &quot;06085500100&quot;, &quot;San Jose&quot;,
            or &quot;District 1&quot;.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="geography-search-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 rounded border border-[var(--color-border)] px-3 py-2 text-sm"
              placeholder="e.g. 06085500100 or San Jose"
            />
            <button
              type="submit"
              className="rounded bg-[var(--color-interactive)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-interactive-hover)]"
            >
              Search
            </button>
          </div>
        </form>

        <div aria-live="polite" className="mt-4">
          {submittedQuery.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Enter a search term above to find a geography.
            </p>
          )}
          {searchQuery.isLoading && submittedQuery.length > 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Searching…
            </p>
          )}
          {searchQuery.isError && (
            <p className="text-sm text-[var(--color-alert)]">
              {searchQuery.error instanceof ApiError
                ? `Search unavailable: ${searchQuery.error.message}`
                : "Search is temporarily unavailable. Is the API running?"}
            </p>
          )}
          {searchQuery.data && searchQuery.data.results.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No geographies matched &quot;{submittedQuery}&quot;. Try a
              different tract GEOID, city name, or district.
            </p>
          )}
          {searchQuery.data && searchQuery.data.results.length > 0 && (
            <>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {searchQuery.data.results.length} result
                {searchQuery.data.results.length === 1 ? "" : "s"} ·{" "}
                <DataModeBadge mode={searchQuery.data.data_mode} />
              </p>
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
                {searchQuery.data.results.map((result) => (
                  <li key={`${result.geography_type}-${result.geography_id}`}>
                    <button
                      type="button"
                      onClick={() =>
                        selectGeography(result.geography_type, result.geography_id)
                      }
                      aria-current={
                        selectedType === result.geography_type &&
                        selectedId === result.geography_id
                          ? "true"
                          : undefined
                      }
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-background)] focus-visible:bg-[var(--color-background)] aria-[current=true]:bg-[var(--color-background)] aria-[current=true]:font-medium"
                    >
                      <span className="text-[var(--color-text-secondary)]">
                        {formatTypeLabel(result.geography_type)}
                      </span>{" "}
                      {result.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div>
        {selectedType && selectedId ? (
          <GeographyProfile type={selectedType} id={selectedId} />
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-text-secondary)]">
            Select a search result to see its profile.
          </div>
        )}
      </div>
    </div>
  );
}

function formatTypeLabel(type: GeographyType): string {
  switch (type) {
    case "tract":
      return "Tract";
    case "place":
      return "City";
    case "supervisor_district":
      return "District";
    case "zcta":
      return "ZCTA";
    case "county":
      return "County";
  }
}

function DataModeBadge({ mode }: { mode: "live" | "demo" }) {
  return (
    <span
      className={
        mode === "demo"
          ? "text-[var(--color-caution)]"
          : "text-[var(--color-interactive)]"
      }
    >
      {mode === "demo" ? "demo data snapshot" : "live data"}
    </span>
  );
}

function GeographyProfile({ type, id }: { type: GeographyType; id: string }) {
  if (type === "tract") return <TractProfileView tractGeoid={id} />;
  if (type === "place") return <PlaceProfileView placeGeoid={id} />;
  if (type === "supervisor_district")
    return <DistrictProfileView districtNumber={Number(id)} />;
  return (
    <p className="text-sm text-[var(--color-text-secondary)]">
      Profile view for {type} is added in a later phase.
    </p>
  );
}

function TractProfileView({ tractGeoid }: { tractGeoid: string }) {
  const query = useQuery({
    queryKey: ["tract-profile", tractGeoid],
    queryFn: () => api.getTractProfile(tractGeoid),
    retry: 1,
  });
  return (
    <ProfileFrame
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
    >
      {query.data && <TractProfileCard profile={query.data} />}
    </ProfileFrame>
  );
}

function TractProfileCard({ profile }: { profile: TractProfile }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-lg font-semibold">
        Tract {profile.tract_geoid_2020}
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {profile.name_long} · <DataModeBadge mode={profile.data_mode} />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--color-text-secondary)]">Land area</dt>
          <dd>{(profile.area_land_sqm / 1_000_000).toFixed(2)} km²</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">
            Supervisor district
          </dt>
          <dd>
            {profile.supervisor_district ?? "unassigned"}
            {profile.supervisor_district_is_clean_assignment === false && (
              <span className="ml-1 text-[var(--color-caution)]">
                (boundary-crossing:{" "}
                {((profile.supervisor_district_share ?? 0) * 100).toFixed(0)}%
                in this district)
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
        {profile.note}
      </p>
    </div>
  );
}

function PlaceProfileView({ placeGeoid }: { placeGeoid: string }) {
  const query = useQuery({
    queryKey: ["place-profile", placeGeoid],
    queryFn: () => api.getPlaceProfile(placeGeoid),
    retry: 1,
  });
  return (
    <ProfileFrame
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
    >
      {query.data && <PlaceProfileCard profile={query.data} />}
    </ProfileFrame>
  );
}

function PlaceProfileCard({ profile }: { profile: PlaceProfile }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-lg font-semibold">{profile.name_long}</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Place GEOID {profile.place_geoid} ·{" "}
        <DataModeBadge mode={profile.data_mode} />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--color-text-secondary)]">Land area</dt>
          <dd>{(profile.area_land_sqm / 1_000_000).toFixed(2)} km²</dd>
        </div>
      </dl>
    </div>
  );
}

function DistrictProfileView({ districtNumber }: { districtNumber: number }) {
  const query = useQuery({
    queryKey: ["district-profile", districtNumber],
    queryFn: () => api.getSupervisorDistrictProfile(districtNumber),
    retry: 1,
  });
  return (
    <ProfileFrame
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
    >
      {query.data && <DistrictProfileCard profile={query.data} />}
    </ProfileFrame>
  );
}

function DistrictProfileCard({
  profile,
}: {
  profile: SupervisorDistrictProfile;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-lg font-semibold">
        Supervisor District {profile.district_number}
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Supervisor {profile.supervisor_name} ·{" "}
        <DataModeBadge mode={profile.data_mode} />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--color-text-secondary)]">Area</dt>
          <dd>{profile.area_sq_miles.toFixed(1)} sq mi</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-secondary)]">
            Tracts assigned
          </dt>
          <dd>{profile.tract_count}</dd>
        </div>
      </dl>
    </div>
  );
}

function ProfileFrame({
  isLoading,
  isError,
  error,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div
        role="status"
        className="rounded-lg border border-[var(--color-border)] p-6 text-sm text-[var(--color-text-secondary)]"
      >
        Loading profile…
      </div>
    );
  }
  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-[var(--color-alert)] p-6 text-sm text-[var(--color-alert)]"
      >
        {error instanceof ApiError
          ? `Couldn't load this profile: ${error.message}`
          : "Couldn't load this profile. Is the API running?"}
      </div>
    );
  }
  return <>{children}</>;
}
