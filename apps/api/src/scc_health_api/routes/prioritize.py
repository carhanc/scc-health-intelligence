"""Phase 7 Prioritize API: custom domain-weighting, ranked exports, and
evidence-backed decision memos, all built on top of the already-tested
Phase 4 scoring engine (`analytics.domain_scores`, `analytics.scenario_scores`)
and Phase 6 optimization outputs (`analytics.optimization_runs`) --
no scoring or optimization math is reimplemented here beyond the
dependency-isolated custom-weighting aggregator in
`services/custom_scenario_scoring.py` (DEC-022/DEC-051 pattern), which is
unit-tested against the pipeline's own hand-calculated cases.

Named-scenario ranking, explainability, comparison, and optimizer
scenarios are all served by the existing `/api/v1/scenarios/*` and
`/api/v1/optimization/*` routes (analytics.py, access.py) -- this module
only adds what those do not already cover: an on-demand custom weight
vector, and export formatting.
"""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.schemas.prioritize import (
    CustomDomainContribution,
    CustomScoreResponse,
    CustomScoreTract,
    DecisionMemoResponse,
    MemoDomainLine,
    MemoTractEntry,
)
from scc_health_api.services.analytics_config import load_scenario_metadata
from scc_health_api.services.custom_scenario_scoring import (
    InvalidWeightsError,
    compute_custom_score,
    validate_custom_weights,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/prioritize", tags=["prioritize"])

_ANALYTICS_UNAVAILABLE_DETAIL = (
    "Phase 4 analytics tables are not present in the current warehouse. Run `make data` first."
)

# Mirrors apps/web/lib/labels.ts's DOMAIN_LABELS -- kept here only for
# generating self-contained, plain-language memo/CSV text server-side;
# the frontend's own copy remains the source of truth for on-screen UI
# labels (this module never renders a page, only export content).
_DOMAIN_LABELS = {
    "health_burden": "Health burden",
    "access_barriers": "Access barriers",
    "environmental_burden": "Environmental burden",
    "resource_accessibility": "Resource accessibility",
    "workforce_shortage": "Workforce shortage",
}


def _domain_label(domain: str) -> str:
    return _DOMAIN_LABELS.get(domain, domain.replace("_", " ").capitalize())


def _require_table(conn: duckdb.DuckDBPyConnection, table: str) -> None:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = 'analytics' AND table_name = ?",
        [table],
    ).fetchone()
    if not row or row[0] == 0:
        raise HTTPException(status_code=503, detail=_ANALYTICS_UNAVAILABLE_DETAIL)


class CustomScoreRequest(BaseModel):
    weights: dict[str, float] = Field(
        ..., description="Domain -> weight, must be non-negative and sum to 1.0."
    )


def _load_domain_scores(
    conn: duckdb.DuckDBPyConnection,
) -> dict[str, dict[str, float]]:
    """tract_geoid_2020 -> domain -> score (only present/non-null scores)."""
    rows = conn.execute(
        "SELECT tract_geoid_2020, domain, score FROM analytics.domain_scores "
        "WHERE score IS NOT NULL"
    ).fetchall()
    by_tract: dict[str, dict[str, float]] = {}
    for tract, domain, score in rows:
        by_tract.setdefault(tract, {})[domain] = float(score)
    return by_tract


@router.post("/custom-score", response_model=CustomScoreResponse)
def compute_custom_weighting(
    request: CustomScoreRequest, settings: Settings = Depends(get_settings)
) -> CustomScoreResponse:
    try:
        validate_custom_weights(request.weights)
    except InvalidWeightsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "domain_scores")
            all_tracts = [
                r[0] for r in conn.execute("SELECT tract_geoid_2020 FROM geo.tracts").fetchall()
            ]
            domain_scores_by_tract = _load_domain_scores(conn)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    results = []
    for tract in all_tracts:
        result = compute_custom_score(
            request.weights, domain_scores_by_tract.get(tract, {}), tract
        )
        results.append(
            CustomScoreTract(
                tract_geoid_2020=result.tract_geoid_2020,
                score=result.score,
                coverage_fraction=result.coverage_fraction,
                domains_missing=result.domains_missing,
                domain_contributions=[
                    CustomDomainContribution(
                        domain=c.domain,
                        domain_score=c.domain_score,
                        configured_weight=c.configured_weight,
                        normalized_weight=c.normalized_weight,
                        contribution=c.contribution,
                    )
                    for c in result.domain_contributions
                ],
            )
        )
    results.sort(key=lambda r: (r.score is None, -(r.score or 0)))

    return CustomScoreResponse(
        data_mode=mode,
        weights=request.weights,
        total_tracts=len(results),
        tracts=results,
    )


def _resolve_weights_and_label(
    scenario_id: str | None, weights_param: str | None
) -> tuple[dict[str, float], str, bool]:
    if scenario_id and weights_param:
        raise HTTPException(
            status_code=400, detail="Provide either scenario_id or weights, not both."
        )
    if scenario_id:
        scenario = next(
            (s for s in load_scenario_metadata() if s.scenario_id == scenario_id), None
        )
        if scenario is None:
            raise HTTPException(status_code=404, detail=f"Unknown scenario_id: {scenario_id}")
        return scenario.weights, scenario.label, False
    if weights_param:
        import json

        try:
            parsed = json.loads(weights_param)
            weights = {str(k): float(v) for k, v in parsed.items()}
        except (ValueError, TypeError, AttributeError) as exc:
            raise HTTPException(
                status_code=400, detail=f"weights must be a JSON object of domain -> number: {exc}"
            ) from exc
        try:
            validate_custom_weights(weights)
        except InvalidWeightsError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return weights, "Custom scenario", True
    raise HTTPException(status_code=400, detail="Provide either scenario_id or weights.")


@router.get("/export/csv", response_class=PlainTextResponse)
def export_csv(
    scenario_id: str | None = Query(None),
    weights: str | None = Query(None, description="JSON object of domain -> weight"),
    limit: int = Query(408, ge=1, le=408),
    settings: Settings = Depends(get_settings),
) -> PlainTextResponse:
    resolved_weights, label, is_custom = _resolve_weights_and_label(scenario_id, weights)

    try:
        with get_read_only_connection(settings) as (conn, _mode):
            _require_table(conn, "domain_scores")
            all_tracts = [
                r[0] for r in conn.execute("SELECT tract_geoid_2020 FROM geo.tracts").fetchall()
            ]
            domain_scores_by_tract = _load_domain_scores(conn)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    rows = []
    for tract in all_tracts:
        result = compute_custom_score(
            resolved_weights, domain_scores_by_tract.get(tract, {}), tract
        )
        rows.append(result)
    rows.sort(key=lambda r: (r.score is None, -(r.score or 0)))
    rows = rows[:limit]

    domain_columns = sorted(resolved_weights)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["rank", "tract_geoid_2020", "combined_priority_score", "coverage_fraction"]
        + [f"{_domain_label(d)} score" for d in domain_columns]
        + ["domains_missing", "data_status"]
    )
    for i, r in enumerate(rows, start=1):
        contrib_by_domain = {c.domain: c.domain_score for c in r.domain_contributions}
        writer.writerow(
            [
                i,
                r.tract_geoid_2020,
                f"{r.score:.2f}" if r.score is not None else "",
                f"{r.coverage_fraction:.2f}",
            ]
            + [
                f"{contrib_by_domain[d]:.1f}" if d in contrib_by_domain else ""
                for d in domain_columns
            ]
            + [";".join(r.domains_missing), "modeled_priority_score"]
        )

    filename = f"prioritize_{'custom' if is_custom else scenario_id}.csv"
    return PlainTextResponse(
        buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/memo", response_model=DecisionMemoResponse)
def export_memo(
    scenario_id: str | None = Query(None),
    weights: str | None = Query(None, description="JSON object of domain -> weight"),
    top_n: int = Query(10, ge=1, le=50),
    settings: Settings = Depends(get_settings),
) -> DecisionMemoResponse:
    resolved_weights, label, is_custom = _resolve_weights_and_label(scenario_id, weights)

    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "domain_scores")
            all_tracts = [
                r[0] for r in conn.execute("SELECT tract_geoid_2020 FROM geo.tracts").fetchall()
            ]
            domain_scores_by_tract = _load_domain_scores(conn)
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    scored = [
        compute_custom_score(resolved_weights, domain_scores_by_tract.get(tract, {}), tract)
        for tract in all_tracts
    ]
    scored.sort(key=lambda r: (r.score is None, -(r.score or 0)))
    top = [r for r in scored if r.score is not None][:top_n]

    entries = []
    for rank, r in enumerate(top, start=1):
        top_domains = sorted(r.domain_contributions, key=lambda c: -c.contribution)[:3]
        entries.append(
            MemoTractEntry(
                tract_geoid_2020=r.tract_geoid_2020,
                rank=rank,
                score=r.score,
                coverage_fraction=r.coverage_fraction,
                top_domains=[
                    MemoDomainLine(
                        domain=c.domain,
                        label=_domain_label(c.domain),
                        domain_score=c.domain_score,
                        contribution=c.contribution,
                    )
                    for c in top_domains
                ],
            )
        )

    weights_desc = ", ".join(f"{_domain_label(d)} {w:.0%}" for d, w in resolved_weights.items())

    return DecisionMemoResponse(
        data_mode=mode,
        generated_at=datetime.now(UTC).isoformat(),
        scenario_label=label,
        weights_used=resolved_weights,
        is_custom_weighting=is_custom,
        constraints_note=(
            f"Weighting: {weights_desc}. This memo lists the top {len(entries)} tracts by "
            "combined priority score under this weighting; it does not apply any site-count, "
            "budget, or geographic constraint -- see the Access Lab optimizer scenarios for "
            "site-selection results under explicit constraints."
        ),
        top_tracts=entries,
        methodology_note=(
            "Each tract's combined priority score is a weighted average of five domain scores "
            "(health burden, access barriers, environmental burden, resource accessibility, "
            "workforce shortage), each itself built from county-relative percentiles of "
            "published public-health, demographic, and environmental measures. A domain missing "
            "for a tract is excluded and the remaining weights renormalized (coverage_fraction "
            "shows how much of the intended weighting was actually available for that tract) -- "
            "see MODEL_CARD.md and the Validate page for full methodology."
        ),
        limitations_note=(
            "This is a screening tool, not a prediction or a guarantee of program impact. A high "
            "score identifies a tract for closer investigation; it does not establish that any "
            "specific intervention would resolve the underlying conditions, and it must not be "
            "read as an individual-level risk estimate. Rankings can be sensitive to the chosen "
            "weighting -- see the Validate page for stability and sensitivity results under this "
            "and other named scenarios."
        ),
        sources_note=(
            "Every domain score traces to a specific published source (CDC PLACES, American "
            "Community Survey, CalEnviroScreen 5.0, HRSA MUA/HPSA) with its own vintage and "
            "retrieval date -- see each tract's evidence panel on the Explore page, or "
            "DATA_DICTIONARY.md, for full source citations."
        ),
    )
