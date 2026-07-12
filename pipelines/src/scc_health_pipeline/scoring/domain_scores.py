"""Domain score construction: metric -> subdomain -> domain, with equal
subdomain weighting and a coverage threshold, per
docs/03_ANALYTICS_METHODS.md §6.

Missing data is never imputed to zero or the county median (§6.2: "Do
not impute missing metrics with zero or the county median in production
scoring"). A subdomain average simply excludes tracts/metrics that are
missing; a domain score becomes None (not zero) for a tract when too few
of its subdomains are present, and every result records exactly which
components were present/missing so the explainability layer can show it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.metrics.transforms import (
    county_relative_percentile,
    flip_direction,
    winsorize,
)

DEFAULT_DOMAIN_COVERAGE_THRESHOLD = 0.7  # docs/03 §6.2 default


@dataclass(frozen=True)
class MetricScoreResult:
    metric_id: str
    domain: str
    subdomain: str
    tract_geoid_2020: str
    raw_value: float | None
    concern_value: float | None
    percentile: float | None
    standard_error: float | None = None
    low_confidence_limit: float | None = None
    high_confidence_limit: float | None = None


@dataclass(frozen=True)
class MetricCoverageResult:
    metric_id: str
    n_tracts_present: int
    n_tracts_total: int
    coverage_fraction: float
    included: bool
    reason_excluded: str | None = None


def compute_metric_scores(
    raw_df: pl.DataFrame, definition: MetricDefinition
) -> tuple[list[MetricScoreResult], MetricCoverageResult]:
    """raw_df must have columns tract_geoid_2020, raw_value, and
    optionally standard_error or low_confidence_limit/high_confidence_limit
    (as produced by metrics/registry.py::evaluate_metric)."""
    tracts = raw_df["tract_geoid_2020"].to_list()
    raw_values = raw_df["raw_value"].to_list()
    has_se = "standard_error" in raw_df.columns
    has_ci = "low_confidence_limit" in raw_df.columns
    se_values = raw_df["standard_error"].to_list() if has_se else [None] * len(tracts)
    low_values = raw_df["low_confidence_limit"].to_list() if has_ci else [None] * len(tracts)
    high_values = raw_df["high_confidence_limit"].to_list() if has_ci else [None] * len(tracts)

    n_total = len(raw_values)
    n_present = sum(1 for v in raw_values if v is not None)
    coverage_fraction = n_present / n_total if n_total else 0.0
    included = coverage_fraction >= definition.minimum_coverage
    reason = (
        None
        if included
        else (
            f"actual coverage {coverage_fraction:.1%} is below the configured "
            f"minimum_coverage {definition.minimum_coverage:.1%}"
        )
    )
    coverage_result = MetricCoverageResult(
        definition.metric_id, n_present, n_total, coverage_fraction, included, reason
    )

    if not included:
        # An under-covered metric is excluded from scoring entirely (not
        # silently included with a degraded contribution) -- every tract
        # gets a None result for this metric, visible as "missing" at
        # the subdomain level.
        results = [
            MetricScoreResult(
                definition.metric_id, definition.domain, definition.subdomain, t, None, None, None
            )
            for t in tracts
        ]
        return results, coverage_result

    concern_values = [flip_direction(v, definition.direction) for v in raw_values]
    if definition.winsorization_enabled:
        w = winsorize(
            concern_values, definition.winsorization_lower_pct, definition.winsorization_upper_pct
        )
        concern_values = w.winsorized_values
    percentiles = county_relative_percentile(concern_values)

    results = [
        MetricScoreResult(
            metric_id=definition.metric_id,
            domain=definition.domain,
            subdomain=definition.subdomain,
            tract_geoid_2020=tracts[i],
            raw_value=raw_values[i],
            concern_value=concern_values[i],
            percentile=percentiles[i],
            standard_error=se_values[i],
            low_confidence_limit=low_values[i],
            high_confidence_limit=high_values[i],
        )
        for i in range(n_total)
    ]
    return results, coverage_result


@dataclass(frozen=True)
class SubdomainScoreResult:
    domain: str
    subdomain: str
    tract_geoid_2020: str
    score: float | None
    metric_ids_present: list[str] = field(default_factory=list)
    metric_ids_missing: list[str] = field(default_factory=list)


def compute_subdomain_scores(
    metric_scores: list[MetricScoreResult],
) -> list[SubdomainScoreResult]:
    by_key: dict[tuple[str, str, str], list[MetricScoreResult]] = {}
    for m in metric_scores:
        key = (m.domain, m.subdomain, m.tract_geoid_2020)
        by_key.setdefault(key, []).append(m)

    results = []
    for (domain, subdomain, tract), members in by_key.items():
        present = [m for m in members if m.percentile is not None]
        missing = [m for m in members if m.percentile is None]
        score = (
            sum(m.percentile for m in present) / len(present) if present else None  # type: ignore[misc]
        )
        results.append(
            SubdomainScoreResult(
                domain=domain,
                subdomain=subdomain,
                tract_geoid_2020=tract,
                score=score,
                metric_ids_present=[m.metric_id for m in present],
                metric_ids_missing=[m.metric_id for m in missing],
            )
        )
    return results


@dataclass(frozen=True)
class DomainScoreResult:
    domain: str
    tract_geoid_2020: str
    score: float | None
    coverage_fraction: float
    n_subdomains_present: int
    n_subdomains_total: int
    subdomains_present: list[str] = field(default_factory=list)
    subdomains_missing: list[str] = field(default_factory=list)
    below_coverage_threshold: bool = False


def compute_domain_scores(
    subdomain_scores: list[SubdomainScoreResult],
    coverage_threshold: float = DEFAULT_DOMAIN_COVERAGE_THRESHOLD,
) -> list[DomainScoreResult]:
    by_key: dict[tuple[str, str], list[SubdomainScoreResult]] = {}
    for s in subdomain_scores:
        key = (s.domain, s.tract_geoid_2020)
        by_key.setdefault(key, []).append(s)

    results = []
    for (domain, tract), members in by_key.items():
        present = [s for s in members if s.score is not None]
        missing = [s for s in members if s.score is None]
        n_total = len(members)
        coverage_fraction = len(present) / n_total if n_total else 0.0
        below_threshold = coverage_fraction < coverage_threshold
        score = (
            sum(s.score for s in present) / len(present)  # type: ignore[misc]
            if present and not below_threshold
            else None
        )
        results.append(
            DomainScoreResult(
                domain=domain,
                tract_geoid_2020=tract,
                score=score,
                coverage_fraction=coverage_fraction,
                n_subdomains_present=len(present),
                n_subdomains_total=n_total,
                subdomains_present=[s.subdomain for s in present],
                subdomains_missing=[s.subdomain for s in missing],
                below_coverage_threshold=below_threshold,
            )
        )
    return results
