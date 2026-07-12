"""Weight sensitivity and robustness analysis, per
docs/03_ANALYTICS_METHODS.md §9.

Two independent sensitivity checks feed the final stability label:
  1. Preset sensitivity (§9.1): recompute the scenario score under 5
     named weight presets (balanced/need-first/access-first/
     resource-first/systemic-pressure-first, DEC-028).
  2. Random-weight (Dirichlet) sensitivity (§9.2): resample domain
     weights from a Dirichlet distribution constrained to the scenario's
     own domains, tracking how often/how highly each tract ranks across
     >=1000 draws.

Stability labels (§9.3) are never described as a probability of real-
world intervention success -- they characterize how much a tract's
*priority conclusion* depends on the analyst's weighting choices and on
data completeness, nothing more.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from scc_health_pipeline.scoring.domain_scores import DomainScoreResult
from scc_health_pipeline.scoring.scenario_scores import compute_scenario_score
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition, SensitivityPreset

DEFAULT_DIRICHLET_DRAWS = 1000
DEFAULT_SEED = 42

STABILITY_ROBUST = "Robust"
STABILITY_MODERATELY_STABLE = "Moderately stable"
STABILITY_ASSUMPTION_SENSITIVE = "Assumption-sensitive"
STABILITY_DATA_LIMITED = "Data-limited"

_ROBUST_THRESHOLD = 0.75
_MODERATE_THRESHOLD = 0.40
_LOW_CONFIDENCE_THRESHOLD = 0.40


@dataclass(frozen=True)
class PresetScoreResult:
    preset_id: str
    tract_geoid_2020: str
    score: float | None
    rank: int | None


def compute_preset_sensitivity(
    presets: list[SensitivityPreset],
    domain_results_by_domain_and_tract: dict[str, dict[str, DomainScoreResult]],
    all_tract_geoids: list[str],
) -> list[PresetScoreResult]:
    results = []
    for preset in presets:
        preset_scenario = ScenarioDefinition(
            scenario_id=preset.preset_id, label=preset.label, description="", weights=preset.weights
        )
        tract_scores: dict[str, float | None] = {}
        for tract in all_tract_geoids:
            domain_results_for_tract = {
                domain: by_tract[tract]
                for domain, by_tract in domain_results_by_domain_and_tract.items()
                if tract in by_tract
            }
            result = compute_scenario_score(preset_scenario, domain_results_for_tract, tract)
            tract_scores[tract] = result.score

        scored = sorted(
            ((t, s) for t, s in tract_scores.items() if s is not None),
            key=lambda ts: ts[1],
            reverse=True,
        )
        rank_by_tract = {t: i + 1 for i, (t, _s) in enumerate(scored)}
        for tract in all_tract_geoids:
            results.append(
                PresetScoreResult(
                    preset_id=preset.preset_id,
                    tract_geoid_2020=tract,
                    score=tract_scores[tract],
                    rank=rank_by_tract.get(tract),
                )
            )
    return results


@dataclass(frozen=True)
class WeightSensitivityResult:
    scenario_id: str
    tract_geoid_2020: str
    median_rank: int | None
    rank_ci_lower: int | None
    rank_ci_upper: int | None
    rank_std: float | None
    probability_top_decile: float | None
    probability_top_quartile: float | None
    most_influential_domain: str | None
    n_draws: int
    seed: int


def compute_weight_sensitivity(
    scenario: ScenarioDefinition,
    domain_results_by_domain_and_tract: dict[str, dict[str, DomainScoreResult]],
    all_tract_geoids: list[str],
    n_draws: int = DEFAULT_DIRICHLET_DRAWS,
    seed: int = DEFAULT_SEED,
) -> list[WeightSensitivityResult]:
    domains = sorted(scenario.weights.keys())
    rng = np.random.default_rng(seed)
    sorted_tracts = sorted(all_tract_geoids)

    ranks_by_tract: dict[str, list[int]] = {t: [] for t in sorted_tracts}
    scores_by_tract: dict[str, list[float]] = {t: [] for t in sorted_tracts}
    weight_draws_by_domain: dict[str, list[float]] = {d: [] for d in domains}

    n_top_decile = max(1, math.ceil(0.10 * len(sorted_tracts)))
    n_top_quartile = max(1, math.ceil(0.25 * len(sorted_tracts)))
    top_decile_hits: dict[str, int] = {t: 0 for t in sorted_tracts}
    top_quartile_hits: dict[str, int] = {t: 0 for t in sorted_tracts}
    n_scored_draws = 0

    alpha = np.ones(len(domains))  # symmetric Dirichlet -- no domain favored a priori
    for _draw in range(n_draws):
        weight_vector = rng.dirichlet(alpha)
        draw_weights = dict(zip(domains, weight_vector.tolist(), strict=True))
        for d, w in draw_weights.items():
            weight_draws_by_domain[d].append(w)

        draw_scenario = ScenarioDefinition(
            scenario_id=scenario.scenario_id,
            label=scenario.label,
            description="",
            weights=draw_weights,
        )
        tract_scores: dict[str, float | None] = {}
        for tract in sorted_tracts:
            domain_results_for_tract = {
                domain: by_tract[tract]
                for domain, by_tract in domain_results_by_domain_and_tract.items()
                if tract in by_tract
            }
            result = compute_scenario_score(draw_scenario, domain_results_for_tract, tract)
            tract_scores[tract] = result.score

        scored = [(t, s) for t, s in tract_scores.items() if s is not None]
        if not scored:
            continue
        n_scored_draws += 1
        ranked = sorted(scored, key=lambda ts: ts[1], reverse=True)
        rank_by_tract = {t: i + 1 for i, (t, _s) in enumerate(ranked)}
        for t, s in scored:
            scores_by_tract[t].append(s)
            rank = rank_by_tract[t]
            ranks_by_tract[t].append(rank)
            if rank <= n_top_decile:
                top_decile_hits[t] += 1
            if rank <= n_top_quartile:
                top_quartile_hits[t] += 1

    results = []
    for t in sorted_tracts:
        ranks = ranks_by_tract[t]
        if not ranks:
            results.append(
                WeightSensitivityResult(
                    scenario.scenario_id,
                    t,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    n_draws,
                    seed,
                )
            )
            continue
        sorted_ranks = sorted(float(r) for r in ranks)
        median_rank = round(_percentile(sorted_ranks, 50.0))
        rank_ci_lower = round(_percentile(sorted_ranks, 10.0))
        rank_ci_upper = round(_percentile(sorted_ranks, 90.0))
        rank_std = float(np.std(ranks))
        p_top_decile = top_decile_hits[t] / n_scored_draws if n_scored_draws else None
        p_top_quartile = top_quartile_hits[t] / n_scored_draws if n_scored_draws else None

        most_influential = _most_influential_domain(
            t, domains, weight_draws_by_domain, scores_by_tract
        )

        results.append(
            WeightSensitivityResult(
                scenario_id=scenario.scenario_id,
                tract_geoid_2020=t,
                median_rank=median_rank,
                rank_ci_lower=rank_ci_lower,
                rank_ci_upper=rank_ci_upper,
                rank_std=rank_std,
                probability_top_decile=p_top_decile,
                probability_top_quartile=p_top_quartile,
                most_influential_domain=most_influential,
                n_draws=n_draws,
                seed=seed,
            )
        )
    return results


def _most_influential_domain(
    tract: str,
    domains: list[str],
    weight_draws_by_domain: dict[str, list[float]],
    scores_by_tract: dict[str, list[float]],
) -> str | None:
    """The domain whose sampled weight correlates most strongly (by
    absolute Pearson correlation) with this tract's score across draws
    -- a standard one-at-a-time sensitivity-attribution technique."""
    scores = scores_by_tract.get(tract, [])
    if len(scores) < 3:
        return None
    best_domain = None
    best_abs_corr = -1.0
    for d in domains:
        weights = weight_draws_by_domain[d][: len(scores)]
        if len(weights) != len(scores):
            continue
        corr = _pearson_correlation(weights, scores)
        if corr is not None and abs(corr) > best_abs_corr:
            best_abs_corr = abs(corr)
            best_domain = d
    return best_domain


def _pearson_correlation(x: list[float], y: list[float]) -> float | None:
    n = len(x)
    if n < 2:
        return None
    mean_x, mean_y = sum(x) / n, sum(y) / n
    cov = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    var_x = sum((xi - mean_x) ** 2 for xi in x)
    var_y = sum((yi - mean_y) ** 2 for yi in y)
    if var_x == 0 or var_y == 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def _percentile(sorted_values: list[float], pct: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100.0) * (len(sorted_values) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = rank - lo
    return sorted_values[lo] + frac * (sorted_values[hi] - sorted_values[lo])


def classify_stability(
    probability_top_decile_weight_sensitivity: float | None,
    data_confidence_score: float,
) -> str:
    """Combines weight-choice sensitivity (Dirichlet draws) with data
    confidence (coverage/precision/geography/freshness, scoring/
    data_confidence.py) into one of the 4 canonical labels (§9.3). Never
    described as a probability of real-world intervention success."""
    if data_confidence_score < _LOW_CONFIDENCE_THRESHOLD:
        return STABILITY_DATA_LIMITED
    if probability_top_decile_weight_sensitivity is None:
        return STABILITY_DATA_LIMITED
    if probability_top_decile_weight_sensitivity >= _ROBUST_THRESHOLD:
        return STABILITY_ROBUST
    if probability_top_decile_weight_sensitivity >= _MODERATE_THRESHOLD:
        return STABILITY_MODERATELY_STABLE
    return STABILITY_ASSUMPTION_SENSITIVE
