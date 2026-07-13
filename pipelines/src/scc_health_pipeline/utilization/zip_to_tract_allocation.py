"""ZIP-to-tract ED-utilization allocation (Phase 7), closing RISK-015.

HCAI's patient-origin/market-share product (`utilization.hcai_patient_origin`)
is real, observed data at **patient ZIP code** granularity -- never
tract-level as published. This module allocates those real ZIP-level
counts down to the census-tract level using the Census Bureau's own
area-weighted ZCTA-to-tract relationship (`geo.crosswalk_zip_tract`,
built in Phase 2, DEC-005) -- the same crosswalk this project already
uses everywhere else a ZIP/ZCTA figure needs a tract-level estimate.

The result is explicitly a **modeled/derived** allocation, not observed
tract-level utilization: a tract's `modeled_encounters` is its ZIP's real
observed count multiplied by the fraction of that ZIP's *land area*
estimated to fall in the tract, which assumes population (and therefore
ED use) is spread proportionally to land area within a ZIP -- a real,
disclosed approximation, not a demographic or utilization-weighted
estimate. `method` and `crosswalk_quality` are carried on every result so
this is never confused with real tract-level counts.

A second disclosed approximation: HCAI's `patient_zip` is a USPS ZIP
code; the crosswalk is keyed by Census ZCTA (ZIP Code Tabulation Area).
ZIP codes and ZCTAs are not always identical (docs/02 §3) -- this module
joins them directly (the same approximation already used for the
existing ZCTA-tract crosswalk's other consumers), not silently, and
`n_unmatched_zips`/`unmatched_zip_encounters` in `AllocationDiagnostics`
discloses exactly how many real observed encounters could not be
allocated at all because their ZIP had no crosswalk entry.
"""

from __future__ import annotations

from dataclasses import dataclass, field

METHOD_LABEL = "zip_to_tract_area_weighted_allocation"


@dataclass(frozen=True)
class ZipObservedEncounters:
    zip_code: str
    pattype_group: str
    encounters: int


@dataclass(frozen=True)
class CrosswalkRow:
    zcta_geoid: str
    tract_geoid_2020: str
    weight: float
    allocation_quality: str


@dataclass(frozen=True)
class TractModeledEncounters:
    tract_geoid_2020: str
    pattype_group: str
    modeled_encounters: float
    n_contributing_zips: int
    lowest_crosswalk_quality: str
    method: str = METHOD_LABEL


@dataclass
class AllocationDiagnostics:
    total_observed_encounters: int = 0
    total_modeled_encounters: float = 0.0
    n_zips_observed: int = 0
    n_zips_matched: int = 0
    n_unmatched_zips: int = 0
    unmatched_zip_encounters: int = 0
    unmatched_zip_codes: list[str] = field(default_factory=list)


# Crosswalk quality labels ordered worst-to-best is not meaningful here --
# this project's crosswalk only emits one quality tier today
# ("moderate_confidence_crosswalk"), but the ranking exists so a future
# crosswalk with multiple tiers degrades gracefully (the tract's
# disclosed quality is its worst contributing ZIP's quality, not an
# average that could hide a low-confidence contributor).
_QUALITY_RANK = {
    "high_confidence_crosswalk": 0,
    "moderate_confidence_crosswalk": 1,
    "low_confidence_crosswalk": 2,
}


def _worst_quality(qualities: list[str]) -> str:
    return max(qualities, key=lambda q: _QUALITY_RANK.get(q, 99))


def allocate_zip_encounters_to_tracts(
    zip_encounters: list[ZipObservedEncounters],
    crosswalk: list[CrosswalkRow],
) -> tuple[list[TractModeledEncounters], AllocationDiagnostics]:
    """Allocates real ZIP-level observed encounters to tracts by the
    crosswalk's own area-weights. A ZIP with no crosswalk entry at all
    contributes zero tracts and its encounters are disclosed as
    unmatched in `AllocationDiagnostics` -- never silently dropped, and
    never assumed to belong to some default/nearest tract.
    """
    crosswalk_by_zip: dict[str, list[CrosswalkRow]] = {}
    for row in crosswalk:
        crosswalk_by_zip.setdefault(row.zcta_geoid, []).append(row)

    diagnostics = AllocationDiagnostics()
    # tract_geoid -> pattype_group -> [(modeled_encounters_contribution, quality)]
    accumulator: dict[tuple[str, str], list[tuple[float, str]]] = {}

    for zc in zip_encounters:
        diagnostics.n_zips_observed += 1
        diagnostics.total_observed_encounters += zc.encounters
        rows = crosswalk_by_zip.get(zc.zip_code)
        if not rows:
            diagnostics.n_unmatched_zips += 1
            diagnostics.unmatched_zip_encounters += zc.encounters
            diagnostics.unmatched_zip_codes.append(zc.zip_code)
            continue
        diagnostics.n_zips_matched += 1
        for row in rows:
            key = (row.tract_geoid_2020, zc.pattype_group)
            contribution = zc.encounters * row.weight
            accumulator.setdefault(key, []).append((contribution, row.allocation_quality))

    results: list[TractModeledEncounters] = []
    for (tract_geoid, pattype_group), contributions in accumulator.items():
        modeled_total = sum(c for c, _q in contributions)
        results.append(
            TractModeledEncounters(
                tract_geoid_2020=tract_geoid,
                pattype_group=pattype_group,
                modeled_encounters=modeled_total,
                n_contributing_zips=len(contributions),
                lowest_crosswalk_quality=_worst_quality([q for _c, q in contributions]),
            )
        )
        diagnostics.total_modeled_encounters += modeled_total

    return results, diagnostics
