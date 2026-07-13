"""Typed response schemas for the Phase 7 Prioritize API
(/api/v1/prioritize/*). Custom-weighting results reuse the exact same
shape as a named scenario's domain-contribution explainability
(analytics.py's ScoreExplanationResponse) so the frontend can render
both with one component -- but a custom weighting never carries Monte
Carlo/sensitivity fields, since those are only precomputed for the 7+1
named scenarios (disclosed via `has_uncertainty_data=False`, never a
silently-omitted field).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DataMode = Literal["live", "demo"]


class CustomDomainContribution(BaseModel):
    domain: str
    domain_score: float
    configured_weight: float
    normalized_weight: float
    contribution: float


class CustomScoreTract(BaseModel):
    tract_geoid_2020: str
    score: float | None
    coverage_fraction: float
    domains_missing: list[str]
    domain_contributions: list[CustomDomainContribution]


class CustomScoreResponse(BaseModel):
    data_mode: DataMode
    weights: dict[str, float]
    has_uncertainty_data: Literal[False] = False
    uncertainty_note: str = (
        "Custom weightings show a point-in-time score only. Monte Carlo uncertainty ranges and "
        "assumption-sensitivity labels are precomputed only for the platform's named scenarios "
        "-- pick the closest named scenario to see a full uncertainty picture."
    )
    total_tracts: int
    tracts: list[CustomScoreTract]


class MemoDomainLine(BaseModel):
    domain: str
    label: str
    domain_score: float
    contribution: float


class MemoTractEntry(BaseModel):
    tract_geoid_2020: str
    rank: int
    score: float | None
    coverage_fraction: float
    top_domains: list[MemoDomainLine]


class DecisionMemoResponse(BaseModel):
    data_mode: DataMode
    generated_at: str
    scenario_label: str
    weights_used: dict[str, float]
    is_custom_weighting: bool
    constraints_note: str
    top_tracts: list[MemoTractEntry]
    methodology_note: str
    limitations_note: str
    sources_note: str
