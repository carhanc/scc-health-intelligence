"""Lightweight, dependency-free resource-gap classification for the
Access Lab API.

Deliberately a local copy of the same percentile-rank + tercile-overlap
logic as `pipelines/src/scc_health_pipeline/analytics/resource_gap.py`,
not an import of it (DEC-022's established pattern, see
`services/analytics_config.py`): that pipeline package also pulls in
OR-Tools, GeoPandas, and OSMnx via sibling modules, which the API does
not need just to compute a percentile-rank classification over two
already-materialized score columns. This module has zero non-stdlib
dependencies by design. If the two ever need to diverge, that is a sign
the classification method itself has changed and both copies should be
updated in the same commit -- there is no third place this logic lives.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

GapClassification = Literal["priority_gap", "need_met", "low_priority", "well_served"]

METHOD_LABEL = "resource_gap_tercile_overlap"

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
    if not all_values:
        raise ValueError("all_values must be non-empty")
    n_at_or_below = sum(1 for v in all_values if v <= value)
    return 100.0 * n_at_or_below / len(all_values)


def classify_gap(need_percentile: float, access_percentile: float) -> GapClassification:
    need_is_high = need_percentile >= _HIGH_PERCENTILE_THRESHOLD
    access_is_low = access_percentile <= _LOW_PERCENTILE_THRESHOLD
    need_is_low = need_percentile <= _LOW_PERCENTILE_THRESHOLD
    access_is_high = access_percentile >= _HIGH_PERCENTILE_THRESHOLD

    if need_is_high and access_is_low:
        return "priority_gap"
    if need_is_high and access_is_high:
        return "need_met"
    if need_is_low and access_is_low:
        return "low_priority"
    if need_is_low and access_is_high:
        return "well_served"

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
