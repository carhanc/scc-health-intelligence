"""Resource-gap analysis (Phase 6 Access Lab): where does high estimated
health need overlap with weak measured resource access, and which of
those overlaps are stable across reasonable methodological choices
(walking vs. driving, count-proxy vs. real-capacity E2SFCA) versus
sensitive to them.

This is an ASSOCIATION/OVERLAP classification, never a causal claim --
per this project's non-negotiable rule, a tract classified "priority
gap" here means its estimated need percentile and measured access
percentile both fall in the flagged tercile, nothing about why, and
nothing about whether adding a facility would change any health outcome.
Every classification is described to users as "estimated need" and
"measured access," never "risk" or "impact."

Percentiles are computed county-relative (consistent with Phase 4's
domain/scenario score convention, docs/03 §5.3), among exactly the
geographies passed in -- callers must pass a complete, consistent
denominator (e.g. all 1,173 block groups, or all 408 tracts), not an
arbitrary subset, or the percentiles will not mean "county-relative."
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

GapClassification = Literal["priority_gap", "need_met", "low_priority", "well_served"]

METHOD_LABEL = "resource_gap_tercile_overlap"

# Tercile split -- top third = "high," bottom third = "low," per this
# module's own disclosed convention (not a universal standard; recorded
# here so it can be audited/changed in one place).
_HIGH_PERCENTILE_THRESHOLD = 66.666667
_LOW_PERCENTILE_THRESHOLD = 33.333333


@dataclass(frozen=True)
class GapResult:
    geography_id: str
    need_percentile: float
    access_percentile: float
    classification: GapClassification
    method: str = METHOD_LABEL


def _percentile_rank(value: float, all_values: list[float]) -> float:
    """Percentage of values in `all_values` that are <= `value` (a
    standard "percent of peers at or below this value" county-relative
    percentile, matching Phase 4's own metric-preprocessing convention,
    docs/03 §5.3)."""
    if not all_values:
        raise ValueError("all_values must be non-empty")
    n_at_or_below = sum(1 for v in all_values if v <= value)
    return 100.0 * n_at_or_below / len(all_values)


def classify_gap(
    need_percentile: float,
    access_percentile: float,
    high_threshold: float = _HIGH_PERCENTILE_THRESHOLD,
    low_threshold: float = _LOW_PERCENTILE_THRESHOLD,
) -> GapClassification:
    """High need + low access = priority_gap (the combination this
    analysis exists to surface). High need + high access = need_met. Low
    need + low access = low_priority (a real access gap, but not where
    estimated need is concentrated). Low need + high access =
    well_served. A geography in neither tercile on one axis (the "middle
    third") is classified using its nearer tercile boundary -- documented
    as a simplification, not a silent ambiguity."""
    need_is_high = need_percentile >= high_threshold
    access_is_low = access_percentile <= low_threshold
    need_is_low = need_percentile <= low_threshold
    access_is_high = access_percentile >= high_threshold

    if need_is_high and access_is_low:
        return "priority_gap"
    if need_is_high and access_is_high:
        return "need_met"
    if need_is_low and access_is_low:
        return "low_priority"
    if need_is_low and access_is_high:
        return "well_served"

    # Middle-tercile fallback: classify by whichever side of the median
    # each axis falls on, so every geography still gets one of the four
    # labels rather than a fifth "ambiguous" bucket that would need its
    # own UI treatment.
    if need_percentile >= 50.0 and access_percentile < 50.0:
        return "priority_gap"
    if need_percentile >= 50.0:
        return "need_met"
    if access_percentile < 50.0:
        return "low_priority"
    return "well_served"


def compute_resource_gaps(
    need_by_geo: dict[str, float], access_by_geo: dict[str, float]
) -> list[GapResult]:
    """One result per geography present in BOTH inputs. A geography with
    a need value but no access value (or vice versa) is silently excluded
    from the classification -- callers should audit `set(need_by_geo) -
    set(access_by_geo)` separately if that gap-in-the-data itself needs
    disclosure, rather than this function guessing a value for it.
    """
    common_geos = sorted(set(need_by_geo) & set(access_by_geo))
    if not common_geos:
        return []

    need_values = [need_by_geo[g] for g in common_geos]
    access_values = [access_by_geo[g] for g in common_geos]

    results = []
    for geo in common_geos:
        need_pct = _percentile_rank(need_by_geo[geo], need_values)
        access_pct = _percentile_rank(access_by_geo[geo], access_values)
        results.append(
            GapResult(
                geography_id=geo,
                need_percentile=need_pct,
                access_percentile=access_pct,
                classification=classify_gap(need_pct, access_pct),
            )
        )
    return results


def assess_gap_stability(
    classifications_by_variant: dict[str, dict[str, GapClassification]],
) -> dict[str, Literal["stable", "assumption_sensitive"]]:
    """Given the same geography's gap classification under several
    methodological variants (e.g. walk-mode vs. drive-mode E2SFCA, or
    count-proxy vs. real-capacity), returns "stable" for a geography
    whose classification agrees across every variant that includes it,
    "assumption_sensitive" for one where it does not. A geography present
    in only one variant cannot be assessed for stability and is excluded
    (not silently marked either label) -- callers needing that disclosed
    should check for it via `set(all_geos) - set(returned_geos)`.
    """
    geo_to_labels: dict[str, set[GapClassification]] = {}
    for variant_results in classifications_by_variant.values():
        for geo, classification in variant_results.items():
            geo_to_labels.setdefault(geo, set()).add(classification)

    n_variants = len(classifications_by_variant)
    stability: dict[str, Literal["stable", "assumption_sensitive"]] = {}
    for geo, labels in geo_to_labels.items():
        n_variants_with_geo = sum(
            1 for variant in classifications_by_variant.values() if geo in variant
        )
        if n_variants_with_geo < 2 or n_variants < 2:
            continue
        stability[geo] = "stable" if len(labels) == 1 else "assumption_sensitive"
    return stability
