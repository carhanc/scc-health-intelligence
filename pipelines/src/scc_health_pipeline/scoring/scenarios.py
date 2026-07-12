"""Loads config/scenarios.yml into typed ScenarioDefinition and
SensitivityPreset objects, and validates that every weight vector and
required_metrics list is well-formed (docs/03_ANALYTICS_METHODS.md §7,
§9.1; §20 "a scenario references missing metrics" audit).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

_WEIGHT_SUM_TOLERANCE = 1e-6


class ScenarioConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ScenarioDefinition:
    scenario_id: str
    label: str
    description: str
    weights: dict[str, float]
    required_metrics: list[str] = field(default_factory=list)
    minimum_confidence: float = 0.5
    notes: str = ""


@dataclass(frozen=True)
class SensitivityPreset:
    preset_id: str
    label: str
    weights: dict[str, float]
    notes: str = ""


def _validate_weights(owner_id: str, weights: dict[str, float]) -> None:
    total = sum(weights.values())
    if abs(total - 1.0) > _WEIGHT_SUM_TOLERANCE:
        raise ScenarioConfigError(
            f"{owner_id}: weights must sum to 1.0, got {total:.6f} ({weights})"
        )
    for domain, w in weights.items():
        if w < 0:
            raise ScenarioConfigError(f"{owner_id}: negative weight for domain {domain}: {w}")


def load_scenarios(path: Path) -> list[ScenarioDefinition]:
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    entries = raw.get("scenarios", []) if raw else []

    scenarios = []
    seen_ids: set[str] = set()
    for entry in entries:
        scenario_id = entry["scenario_id"]
        if scenario_id in seen_ids:
            raise ScenarioConfigError(f"duplicate scenario_id: {scenario_id}")
        seen_ids.add(scenario_id)
        _validate_weights(scenario_id, entry["weights"])
        constraints = entry.get("constraints", {}) or {}
        scenarios.append(
            ScenarioDefinition(
                scenario_id=scenario_id,
                label=entry["label"],
                description=entry.get("description", ""),
                weights=dict(entry["weights"]),
                required_metrics=list(entry.get("required_metrics", []) or []),
                minimum_confidence=float(constraints.get("minimum_confidence", 0.5)),
                notes=entry.get("notes", ""),
            )
        )
    return scenarios


def load_sensitivity_presets(path: Path) -> list[SensitivityPreset]:
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    entries = raw.get("sensitivity_presets", []) if raw else []

    presets = []
    seen_ids: set[str] = set()
    for entry in entries:
        preset_id = entry["preset_id"]
        if preset_id in seen_ids:
            raise ScenarioConfigError(f"duplicate preset_id: {preset_id}")
        seen_ids.add(preset_id)
        _validate_weights(preset_id, entry["weights"])
        presets.append(
            SensitivityPreset(
                preset_id=preset_id,
                label=entry["label"],
                weights=dict(entry["weights"]),
                notes=entry.get("notes", ""),
            )
        )
    return presets


def validate_scenarios_against_metric_registry(
    scenarios: list[ScenarioDefinition], known_metric_ids: set[str], known_domains: set[str]
) -> list[str]:
    """Returns human-readable problems (empty if clean). Catches a
    scenario referencing a metric_id or domain that doesn't exist in the
    metric registry -- exactly the docs/03 §20 audit requirement."""
    problems = []
    for s in scenarios:
        for domain in s.weights:
            if domain not in known_domains:
                problems.append(f"{s.scenario_id}: weight references unknown domain '{domain}'")
        for metric_id in s.required_metrics:
            if metric_id not in known_metric_ids:
                problems.append(
                    f"{s.scenario_id}: required_metrics references unknown metric_id '{metric_id}'"
                )
    return problems
