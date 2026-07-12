"""Tautology guard: programmatically flags any validation whose
"independent" outcome is actually a component input of the score being
validated, per docs/03_ANALYTICS_METHODS.md §15.1 and CLAUDE.md's
non-negotiable rule: "Never validate a score against a variable used to
construct that score."

Two checks: (1) the outcome metric_id is literally one of the scenario's
contributing metrics (its required_metrics or a metric belonging to one
of its weighted domains); (2) the outcome pulls from the exact same
underlying (source_table, source_field) as one of those metrics under a
different metric_id -- a near-tautology that a naive id-only check would
miss.
"""

from __future__ import annotations

from dataclasses import dataclass

from scc_health_pipeline.metrics.registry import MetricDefinition
from scc_health_pipeline.scoring.scenarios import ScenarioDefinition


@dataclass(frozen=True)
class TautologyCheckResult:
    scenario_id: str
    outcome_identifier: str
    is_tautological: bool
    reason: str


def _contributing_metric_ids(
    scenario: ScenarioDefinition, metric_definitions: list[MetricDefinition]
) -> set[str]:
    ids = {m.metric_id for m in metric_definitions if m.domain in scenario.weights}
    ids |= set(scenario.required_metrics)
    return ids


def check_validation_tautology(
    scenario: ScenarioDefinition,
    metric_definitions: list[MetricDefinition],
    outcome_metric_id: str | None = None,
    outcome_source_table: str | None = None,
    outcome_source_field: str | None = None,
) -> TautologyCheckResult:
    contributing_ids = _contributing_metric_ids(scenario, metric_definitions)
    outcome_identifier = outcome_metric_id or f"{outcome_source_table}.{outcome_source_field}"

    if outcome_metric_id and outcome_metric_id in contributing_ids:
        return TautologyCheckResult(
            scenario.scenario_id,
            outcome_identifier,
            True,
            f"'{outcome_metric_id}' is itself a component metric of scenario "
            f"'{scenario.scenario_id}' (via a weighted domain or required_metrics) -- "
            "this is a construction check, not independent validation.",
        )

    if outcome_source_table and outcome_source_field:
        contributing_defs = [m for m in metric_definitions if m.metric_id in contributing_ids]
        for m in contributing_defs:
            if m.source_table == outcome_source_table and m.source_field == outcome_source_field:
                return TautologyCheckResult(
                    scenario.scenario_id,
                    outcome_identifier,
                    True,
                    f"Outcome ({outcome_source_table}.{outcome_source_field}) reads the exact "
                    f"same underlying column as component metric '{m.metric_id}' -- a "
                    "near-tautology even though it is not registered under the same metric_id.",
                )

    return TautologyCheckResult(
        scenario.scenario_id,
        outcome_identifier,
        False,
        f"'{outcome_identifier}' is not a component metric (or same-column near-duplicate) of "
        f"scenario '{scenario.scenario_id}' -- eligible for independent validation.",
    )
