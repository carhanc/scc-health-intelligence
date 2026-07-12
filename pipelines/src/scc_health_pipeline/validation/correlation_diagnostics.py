"""Correlation diagnostics: Spearman/Pearson with bootstrap confidence
intervals, per docs/03_ANALYTICS_METHODS.md §15.3.

This module computes a genuinely independent **convergent-validity**
check (§15.2: "external established indices only as convergent validity,
with overlap disclosed") between a scenario score and CDC/ATSDR SVI's
overall percentile ranking (`RPL_THEMES`) -- SVI is never a metric-
registry input (Phase 3 governance already keeps it as an independent
benchmark, docs/02 §7.1), and every call is still routed through the
tautology guard before computing anything, so a future scenario that
*does* start using an SVI-derived metric will correctly fail this check
rather than silently validating against itself.

A true criterion-validity check against an independent *outcome* (e.g.
HCAI ED utilization) is not computed in Phase 4: HCAI's ED
patient-county data is native to patient county of residence, and Santa
Clara County is the *only* county in this dataset (n=1) -- there is no
statistically meaningful correlation to compute against a single
county-level data point. This is recorded as a real data-availability
limitation (DECISIONS.md), not silently worked around with a fabricated
n>1 comparison. A genuine tract-level independent-outcome criterion
check is reserved for Phase 7 (Utilization/Validation Lab), which is
positioned specifically to build that crosswalk.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from scipy import stats

from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition
from scc_health_pipeline.validation.tautology_guard import check_validation_tautology

ValidityType = Literal["convergent", "criterion", "face"]

DEFAULT_N_BOOTSTRAP = 2000
DEFAULT_SEED = 42


@dataclass(frozen=True)
class CorrelationDiagnosticResult:
    scenario_id: str
    outcome_label: str
    validity_type: ValidityType
    hypothesis: str
    is_tautological: bool
    tautology_reason: str
    n_paired_observations: int
    n_missing: int
    spearman_r: float | None
    spearman_p_value: float | None
    pearson_r: float | None
    pearson_p_value: float | None
    bootstrap_ci_lower: float | None
    bootstrap_ci_upper: float | None
    n_bootstrap: int
    interpretation_note: str


def _bootstrap_spearman_ci(
    x: list[float], y: list[float], n_bootstrap: int, seed: int
) -> tuple[float | None, float | None]:
    if len(x) < 3:
        return None, None
    rng = np.random.default_rng(seed)
    n = len(x)
    x_arr, y_arr = np.array(x), np.array(y)
    draws = []
    for _ in range(n_bootstrap):
        idx = rng.integers(0, n, size=n)
        r, _p = stats.spearmanr(x_arr[idx], y_arr[idx])
        if not np.isnan(r):
            draws.append(r)
    if not draws:
        return None, None
    return float(np.percentile(draws, 2.5)), float(np.percentile(draws, 97.5))


def run_correlation_diagnostic(
    scenario: ScenarioDefinition,
    metric_definitions: list[MetricDefinition],
    hypothesis: str,
    tract_scores: dict[str, float],
    outcome_values: dict[str, float],
    outcome_label: str,
    outcome_source_table: str,
    outcome_source_field: str,
    validity_type: ValidityType = "convergent",
    n_bootstrap: int = DEFAULT_N_BOOTSTRAP,
    seed: int = DEFAULT_SEED,
) -> CorrelationDiagnosticResult:
    tautology = check_validation_tautology(
        scenario,
        metric_definitions,
        outcome_source_table=outcome_source_table,
        outcome_source_field=outcome_source_field,
    )
    if tautology.is_tautological:
        return CorrelationDiagnosticResult(
            scenario_id=scenario.scenario_id,
            outcome_label=outcome_label,
            validity_type=validity_type,
            hypothesis=hypothesis,
            is_tautological=True,
            tautology_reason=tautology.reason,
            n_paired_observations=0,
            n_missing=0,
            spearman_r=None,
            spearman_p_value=None,
            pearson_r=None,
            pearson_p_value=None,
            bootstrap_ci_lower=None,
            bootstrap_ci_upper=None,
            n_bootstrap=n_bootstrap,
            interpretation_note=(
                "BLOCKED: this comparison was refused because the outcome is not independent "
                "of the scenario's own component metrics (see tautology_reason)."
            ),
        )

    common_tracts = sorted(set(tract_scores) & set(outcome_values))
    n_missing = len(set(tract_scores) | set(outcome_values)) - len(common_tracts)
    x = [tract_scores[t] for t in common_tracts]
    y = [outcome_values[t] for t in common_tracts]

    if len(x) < 3:
        return CorrelationDiagnosticResult(
            scenario_id=scenario.scenario_id,
            outcome_label=outcome_label,
            validity_type=validity_type,
            hypothesis=hypothesis,
            is_tautological=False,
            tautology_reason=tautology.reason,
            n_paired_observations=len(x),
            n_missing=n_missing,
            spearman_r=None,
            spearman_p_value=None,
            pearson_r=None,
            pearson_p_value=None,
            bootstrap_ci_lower=None,
            bootstrap_ci_upper=None,
            n_bootstrap=n_bootstrap,
            interpretation_note="Insufficient paired observations (n<3) to compute a correlation.",
        )

    spearman_r, spearman_p = stats.spearmanr(x, y)
    pearson_r, pearson_p = stats.pearsonr(x, y)
    ci_lower, ci_upper = _bootstrap_spearman_ci(x, y, n_bootstrap, seed)

    return CorrelationDiagnosticResult(
        scenario_id=scenario.scenario_id,
        outcome_label=outcome_label,
        validity_type=validity_type,
        hypothesis=hypothesis,
        is_tautological=False,
        tautology_reason=tautology.reason,
        n_paired_observations=len(x),
        n_missing=n_missing,
        spearman_r=float(spearman_r),
        spearman_p_value=float(spearman_p),
        pearson_r=float(pearson_r),
        pearson_p_value=float(pearson_p),
        bootstrap_ci_lower=ci_lower,
        bootstrap_ci_upper=ci_upper,
        n_bootstrap=n_bootstrap,
        interpretation_note=(
            "A correlation (even a strong one) is evidence of association, not causation, and "
            "does not establish that this scenario's priority screen 'works' as an "
            "intervention-targeting tool -- see MODEL_CARD.md for the full limitations "
            "statement."
        ),
    )
