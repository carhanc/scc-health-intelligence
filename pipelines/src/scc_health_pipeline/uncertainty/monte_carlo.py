"""Monte Carlo score uncertainty propagation, deterministic seed, per
docs/03_ANALYTICS_METHODS.md §8.3.

For each draw: perturb every metric's raw value from a bounded normal
distribution centered on the estimate with its standard error (metrics
with no usable uncertainty field, uncertainty_type="none", are never
perturbed with an invented standard error -- CLAUDE.md prohibits
fabricating uncertainty that was not actually measured), respecting
logical bounds (0-100 for percentages, >=0 for distances/counts),
recompute the full metric -> subdomain -> domain -> scenario pipeline,
and repeat. A fixed seed and deterministic iteration order (tracts and
metrics always processed in the same sorted order) make two runs with
the same seed produce bit-identical output -- verified directly by
pipelines/tests/test_monte_carlo.py's reproducibility test.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import polars as pl

from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.domain_scores import (
    DomainScoreResult,
    compute_domain_scores,
    compute_metric_scores,
    compute_subdomain_scores,
)
from scc_health_pipeline.scoring.scenario_scores import compute_scenario_score
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition
from scc_health_pipeline.uncertainty.moe import places_ci_to_standard_error

DEFAULT_N_DRAWS = 500
DEFAULT_SEED = 42
DEFAULT_CI_LOWER_PCT = 10.0
DEFAULT_CI_UPPER_PCT = 90.0

# Logical bounds per unit, so a perturbed draw never leaves the metric's
# valid range (docs §8.3 step 2: "Respect logical limits, such as 0-100
# for percentages").
_PERCENT_UNITS = {"%", "statewide percentile (0-100)"}


@dataclass(frozen=True)
class MonteCarloConfig:
    n_draws: int = DEFAULT_N_DRAWS
    seed: int = DEFAULT_SEED
    ci_lower_pct: float = DEFAULT_CI_LOWER_PCT
    ci_upper_pct: float = DEFAULT_CI_UPPER_PCT


@dataclass(frozen=True)
class MonteCarloScenarioResult:
    scenario_id: str
    tract_geoid_2020: str
    median_score: float | None
    ci_lower: float | None
    ci_upper: float | None
    median_rank: int | None
    rank_ci_lower: int | None
    rank_ci_upper: int | None
    probability_top_decile: float | None
    probability_top_quartile: float | None
    n_draws: int
    seed: int
    stability_label: str = ""


def _bounds_for(definition: MetricDefinition) -> tuple[float | None, float | None]:
    if definition.unit in _PERCENT_UNITS:
        return 0.0, 100.0
    if definition.unit in {"miles", "binary (0/1)"}:
        return 0.0, None
    return None, None


def _derive_standard_error(
    raw_value: float | None,
    standard_error: float | None,
    low_ci: float | None,
    high_ci: float | None,
    definition: MetricDefinition,
) -> float | None:
    if definition.uncertainty_type == "none" or raw_value is None:
        return None
    if definition.uncertainty_type == "acs_moe":
        return standard_error
    if definition.uncertainty_type == "places_ci" and low_ci is not None and high_ci is not None:
        try:
            return places_ci_to_standard_error(low_ci, high_ci)
        except ValueError:
            return None
    return None


def _perturb(
    rng: np.random.Generator,
    raw_value: float | None,
    standard_error: float | None,
    bounds: tuple[float | None, float | None],
) -> float | None:
    if raw_value is None:
        return None
    if standard_error is None or standard_error <= 0:
        return raw_value
    draw = float(rng.normal(raw_value, standard_error))
    lower, upper = bounds
    if lower is not None:
        draw = max(draw, lower)
    if upper is not None:
        draw = min(draw, upper)
    return draw


def run_monte_carlo(
    scenario: ScenarioDefinition,
    metric_definitions: list[MetricDefinition],
    raw_metric_data: dict[str, pl.DataFrame],
    all_tract_geoids: list[str],
    config: MonteCarloConfig | None = None,
) -> list[MonteCarloScenarioResult]:
    """raw_metric_data maps metric_id -> the DataFrame produced by
    metrics/registry.py::evaluate_metric (tract_geoid_2020, raw_value,
    and optionally standard_error or low/high_confidence_limit)."""
    config = config or MonteCarloConfig()
    rng = np.random.default_rng(config.seed)
    sorted_tracts = sorted(all_tract_geoids)

    # Restrict to metrics feeding this scenario's weighted domains.
    relevant_defs = [d for d in metric_definitions if d.domain in scenario.weights]
    if not relevant_defs:
        return [
            MonteCarloScenarioResult(
                scenario.scenario_id,
                t,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                config.n_draws,
                config.seed,
            )
            for t in sorted_tracts
        ]

    # Precompute per-metric: {tract -> (raw_value, standard_error, bounds)}
    metric_inputs: dict[str, dict[str, tuple[float | None, float | None]]] = {}
    metric_bounds: dict[str, tuple[float | None, float | None]] = {}
    for d in relevant_defs:
        df = raw_metric_data.get(d.metric_id)
        bounds = _bounds_for(d)
        metric_bounds[d.metric_id] = bounds
        by_tract: dict[str, tuple[float | None, float | None]] = {}
        if df is not None:
            has_se = "standard_error" in df.columns
            has_ci = "low_confidence_limit" in df.columns
            for row in df.iter_rows(named=True):
                se = _derive_standard_error(
                    row["raw_value"],
                    row.get("standard_error") if has_se else None,
                    row.get("low_confidence_limit") if has_ci else None,
                    row.get("high_confidence_limit") if has_ci else None,
                    d,
                )
                by_tract[row["tract_geoid_2020"]] = (row["raw_value"], se)
        metric_inputs[d.metric_id] = by_tract

    # scores_by_tract[tract] = list of per-draw scenario scores
    scores_by_tract: dict[str, list[float]] = {t: [] for t in sorted_tracts}
    ranks_by_tract: dict[str, list[int]] = {t: [] for t in sorted_tracts}

    n_top_decile = max(1, math.ceil(0.10 * len(sorted_tracts)))
    n_top_quartile = max(1, math.ceil(0.25 * len(sorted_tracts)))
    top_decile_hits: dict[str, int] = {t: 0 for t in sorted_tracts}
    top_quartile_hits: dict[str, int] = {t: 0 for t in sorted_tracts}
    n_scored_draws = 0

    for _draw in range(config.n_draws):
        draw_metric_scores = []
        for d in relevant_defs:
            by_tract = metric_inputs[d.metric_id]
            bounds = metric_bounds[d.metric_id]
            perturbed_tracts = []
            perturbed_values = []
            for t in sorted_tracts:
                raw_value, se = by_tract.get(t, (None, None))
                perturbed_tracts.append(t)
                perturbed_values.append(_perturb(rng, raw_value, se, bounds))
            draw_df = pl.DataFrame(
                {"tract_geoid_2020": perturbed_tracts, "raw_value": perturbed_values}
            )
            results, coverage = compute_metric_scores(draw_df, d)
            if coverage.included:
                draw_metric_scores.extend(results)

        subdomain_scores = compute_subdomain_scores(draw_metric_scores)
        domain_scores = compute_domain_scores(subdomain_scores)
        domain_results_by_domain_and_tract: dict[str, dict[str, DomainScoreResult]] = {}
        for ds in domain_scores:
            domain_results_by_domain_and_tract.setdefault(ds.domain, {})[ds.tract_geoid_2020] = ds

        draw_scenario_scores: dict[str, float | None] = {}
        for t in sorted_tracts:
            domain_results_for_tract = {
                domain: by_tract[t]
                for domain, by_tract in domain_results_by_domain_and_tract.items()
                if t in by_tract
            }
            result = compute_scenario_score(scenario, domain_results_for_tract, t)
            draw_scenario_scores[t] = result.score

        scored_tracts = [(t, s) for t, s in draw_scenario_scores.items() if s is not None]
        if not scored_tracts:
            continue
        n_scored_draws += 1
        # Rank 1 = highest concern (highest score).
        ranked = sorted(scored_tracts, key=lambda ts: ts[1], reverse=True)
        rank_by_tract = {t: i + 1 for i, (t, _s) in enumerate(ranked)}

        for t, s in scored_tracts:
            scores_by_tract[t].append(s)
            rank = rank_by_tract[t]
            ranks_by_tract[t].append(rank)
            if rank <= n_top_decile:
                top_decile_hits[t] += 1
            if rank <= n_top_quartile:
                top_quartile_hits[t] += 1

    mc_results: list[MonteCarloScenarioResult] = []
    for t in sorted_tracts:
        draws = scores_by_tract[t]
        rank_draws = ranks_by_tract[t]
        if not draws:
            mc_results.append(
                MonteCarloScenarioResult(
                    scenario.scenario_id,
                    t,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    config.n_draws,
                    config.seed,
                )
            )
            continue
        sorted_draws = sorted(draws)
        sorted_ranks = sorted(rank_draws)
        median_score = _percentile(sorted_draws, 50.0)
        ci_lower = _percentile(sorted_draws, config.ci_lower_pct)
        ci_upper = _percentile(sorted_draws, config.ci_upper_pct)
        median_rank = round(_percentile([float(r) for r in sorted_ranks], 50.0))
        rank_ci_lower = round(_percentile([float(r) for r in sorted_ranks], config.ci_lower_pct))
        rank_ci_upper = round(_percentile([float(r) for r in sorted_ranks], config.ci_upper_pct))
        p_top_decile = top_decile_hits[t] / n_scored_draws if n_scored_draws else None
        p_top_quartile = top_quartile_hits[t] / n_scored_draws if n_scored_draws else None

        mc_results.append(
            MonteCarloScenarioResult(
                scenario_id=scenario.scenario_id,
                tract_geoid_2020=t,
                median_score=median_score,
                ci_lower=ci_lower,
                ci_upper=ci_upper,
                median_rank=median_rank,
                rank_ci_lower=rank_ci_lower,
                rank_ci_upper=rank_ci_upper,
                probability_top_decile=p_top_decile,
                probability_top_quartile=p_top_quartile,
                n_draws=config.n_draws,
                seed=config.seed,
            )
        )
    return mc_results


def _percentile(sorted_values: list[float], pct: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100.0) * (len(sorted_values) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = rank - lo
    return sorted_values[lo] + frac * (sorted_values[hi] - sorted_values[lo])
