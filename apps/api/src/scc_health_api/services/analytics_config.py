"""Lightweight, read-only readers for config/metrics.yml and
config/scenarios.yml -- provides scenario/metric labels, descriptions,
and weights to the analytics API routes.

Deliberately does not import `scc_health_pipeline.metrics.registry` /
`scoring.scenarios` (DEC-022's established pattern): those modules also
*validate* the registry against a live warehouse connection and pull in
the full pipeline dependency chain, which the API does not need just to
render labels. This module only parses the same two YAML files for
display metadata, trusting `make audit`'s registry/scenario validation
(already run by the pipeline) rather than re-validating here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[5]
METRICS_CONFIG_PATH = REPO_ROOT / "config" / "metrics.yml"
SCENARIOS_CONFIG_PATH = REPO_ROOT / "config" / "scenarios.yml"


@dataclass(frozen=True)
class MetricMeta:
    metric_id: str
    label: str
    domain: str
    subdomain: str
    unit: str
    direction: str
    plain_language_definition: str
    interpretation: str
    limitations: str
    citation: str


@dataclass(frozen=True)
class ScenarioMeta:
    scenario_id: str
    label: str
    description: str
    weights: dict[str, float]
    required_metrics: list[str] = field(default_factory=list)
    minimum_confidence: float = 0.5
    notes: str = ""


@dataclass(frozen=True)
class SensitivityPresetMeta:
    preset_id: str
    label: str
    weights: dict[str, float]
    notes: str = ""


def load_metric_metadata() -> list[MetricMeta]:
    if not METRICS_CONFIG_PATH.exists():
        return []
    with METRICS_CONFIG_PATH.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    entries = raw.get("metrics", []) if raw else []
    return [
        MetricMeta(
            metric_id=e["metric_id"],
            label=e["label"],
            domain=e["domain"],
            subdomain=e["subdomain"],
            unit=e["unit"],
            direction=e["direction"],
            plain_language_definition=e.get("plain_language_definition", ""),
            interpretation=e.get("interpretation", ""),
            limitations=e.get("limitations", ""),
            citation=e.get("citation", ""),
        )
        for e in entries
    ]


def load_scenario_metadata() -> list[ScenarioMeta]:
    if not SCENARIOS_CONFIG_PATH.exists():
        return []
    with SCENARIOS_CONFIG_PATH.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    entries = raw.get("scenarios", []) if raw else []
    metas = []
    for e in entries:
        constraints = e.get("constraints", {}) or {}
        metas.append(
            ScenarioMeta(
                scenario_id=e["scenario_id"],
                label=e["label"],
                description=e.get("description", ""),
                weights=dict(e["weights"]),
                required_metrics=list(e.get("required_metrics", []) or []),
                minimum_confidence=float(constraints.get("minimum_confidence", 0.5)),
                notes=e.get("notes", ""),
            )
        )
    return metas


def load_sensitivity_preset_metadata() -> list[SensitivityPresetMeta]:
    if not SCENARIOS_CONFIG_PATH.exists():
        return []
    with SCENARIOS_CONFIG_PATH.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    entries = raw.get("sensitivity_presets", []) if raw else []
    return [
        SensitivityPresetMeta(
            preset_id=e["preset_id"],
            label=e["label"],
            weights=dict(e["weights"]),
            notes=e.get("notes", ""),
        )
        for e in entries
    ]
