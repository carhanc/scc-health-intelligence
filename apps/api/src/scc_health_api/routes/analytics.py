"""Phase 4 decision-engine and explainability API: scenarios, domains,
scenario scores, full score explainability, structured recommendations,
location-allocation optimization runs, and validation correlation
diagnostics.

Every route reads directly from the `analytics.*` warehouse tables
populated by `run_analytics_pipeline.py` -- no score or recommendation is
recomputed here (DEC-030): the API is a read-only presentation layer over
already-tested, already-computed analytics output, consistent with
CLAUDE.md's "every numeric answer must come from tested analytics tools
or read-only queries, not freehand model arithmetic."

Phase 4 analytics currently exist only in the live warehouse -- there is
no offline demo snapshot for `analytics.*` yet (STATE.md records this as
an honest, disclosed gap, matching Phase 3's `make demo` limitation).
Every route here returns a truthful 503 (not fabricated data) if the
analytics tables are absent, distinct from the general "no warehouse at
all" 503.
"""

from __future__ import annotations

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.schemas.analytics import (
    CorrelationDiagnostic,
    CorrelationDiagnosticsResponse,
    DataConfidenceDetail,
    DomainContributionDetail,
    DomainListResponse,
    DomainSummary,
    EvidenceItem,
    MetricContribution,
    MetricSummary,
    MonteCarloDetail,
    OptimizationRun,
    OptimizationRunsResponse,
    Recommendation,
    RecommendationsResponse,
    ScenarioListResponse,
    ScenarioScoresResponse,
    ScenarioSummary,
    ScoreExplanationResponse,
    TractScenarioScore,
    WeightSensitivityDetail,
)
from scc_health_api.services.analytics_config import (
    load_metric_metadata,
    load_scenario_metadata,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["analytics"])

_ANALYTICS_UNAVAILABLE_DETAIL = (
    "Phase 4 analytics tables are not present in the current warehouse. Run "
    "`uv run --package scc-health-pipeline python -m scc_health_pipeline.run_analytics_pipeline` "
    "(or `make data`) first. Analytics currently exist only in live mode -- there is no "
    "offline demo snapshot yet (see STATE.md)."
)


def _require_analytics_table(conn: duckdb.DuckDBPyConnection, table: str) -> None:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = 'analytics' AND table_name = ?",
        [table],
    ).fetchone()
    if not row or row[0] == 0:
        raise HTTPException(status_code=503, detail=_ANALYTICS_UNAVAILABLE_DETAIL)


def _known_scenario_ids() -> set[str]:
    return {s.scenario_id for s in load_scenario_metadata()}


def _get_scenario_or_404(scenario_id: str) -> ScenarioSummary:
    for s in load_scenario_metadata():
        if s.scenario_id == scenario_id:
            return ScenarioSummary(
                scenario_id=s.scenario_id,
                label=s.label,
                description=s.description,
                weights=s.weights,
                required_metrics=s.required_metrics,
                minimum_confidence=s.minimum_confidence,
                notes=s.notes,
            )
    raise HTTPException(status_code=404, detail=f"Unknown scenario_id: {scenario_id}")


@router.get("/scenarios", response_model=ScenarioListResponse)
def list_scenarios() -> ScenarioListResponse:
    scenarios = [
        ScenarioSummary(
            scenario_id=s.scenario_id,
            label=s.label,
            description=s.description,
            weights=s.weights,
            required_metrics=s.required_metrics,
            minimum_confidence=s.minimum_confidence,
            notes=s.notes,
        )
        for s in load_scenario_metadata()
    ]
    return ScenarioListResponse(scenarios=scenarios)


@router.get("/domains", response_model=DomainListResponse)
def list_domains() -> DomainListResponse:
    metrics = load_metric_metadata()
    subdomains_by_domain: dict[str, set[str]] = {}
    metrics_by_domain: dict[str, list[MetricSummary]] = {}
    for m in metrics:
        subdomains_by_domain.setdefault(m.domain, set()).add(m.subdomain)
        metrics_by_domain.setdefault(m.domain, []).append(
            MetricSummary(
                metric_id=m.metric_id,
                label=m.label,
                domain=m.domain,
                subdomain=m.subdomain,
                unit=m.unit,
                direction=m.direction,
                plain_language_definition=m.plain_language_definition,
                limitations=m.limitations,
                citation=m.citation,
            )
        )
    return DomainListResponse(
        domains=[
            DomainSummary(
                domain=d,
                subdomains=sorted(subdomains_by_domain[d]),
                metrics=metrics_by_domain[d],
            )
            for d in sorted(subdomains_by_domain)
        ]
    )


@router.get("/scenarios/{scenario_id}/scores", response_model=ScenarioScoresResponse)
def get_scenario_scores(
    scenario_id: str,
    limit: int = Query(50, ge=1, le=408),
    offset: int = Query(0, ge=0),
    order: str = Query("score_desc", pattern="^(score_desc|score_asc)$"),
    settings: Settings = Depends(get_settings),
) -> ScenarioScoresResponse:
    if scenario_id not in _known_scenario_ids():
        raise HTTPException(status_code=404, detail=f"Unknown scenario_id: {scenario_id}")
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_analytics_table(conn, "scenario_scores")
            order_sql = (
                "s.score DESC NULLS LAST" if order == "score_desc" else "s.score ASC NULLS LAST"
            )
            rows = conn.execute(
                f"""
                SELECT s.tract_geoid_2020, s.scenario_id, s.score, s.coverage_fraction,
                       s.domains_missing, st.stability_label, dc.confidence_score,
                       mc.median_score, mc.ci_lower, mc.ci_upper, mc.median_rank,
                       mc.probability_top_decile
                FROM analytics.scenario_scores s
                LEFT JOIN analytics.stability_labels st
                  ON s.tract_geoid_2020 = st.tract_geoid_2020 AND s.scenario_id = st.scenario_id
                LEFT JOIN analytics.data_confidence dc
                  ON s.tract_geoid_2020 = dc.tract_geoid_2020 AND s.scenario_id = dc.scenario_id
                LEFT JOIN analytics.monte_carlo_results mc
                  ON s.tract_geoid_2020 = mc.tract_geoid_2020 AND s.scenario_id = mc.scenario_id
                WHERE s.scenario_id = ?
                ORDER BY {order_sql}
                LIMIT ? OFFSET ?
                """,
                [scenario_id, limit, offset],
            ).fetchall()
            (total,) = conn.execute(
                "SELECT COUNT(*) FROM analytics.scenario_scores WHERE scenario_id = ?",
                [scenario_id],
            ).fetchone()  # type: ignore[misc]
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    scores = [
        TractScenarioScore(
            tract_geoid_2020=r[0],
            scenario_id=r[1],
            score=r[2],
            coverage_fraction=r[3],
            domains_missing=r[4].split(";") if r[4] else [],
            stability_label=r[5],
            confidence_score=r[6],
            monte_carlo_median=r[7],
            monte_carlo_ci_lower=r[8],
            monte_carlo_ci_upper=r[9],
            monte_carlo_median_rank=r[10],
            probability_top_decile=r[11],
        )
        for r in rows
    ]
    return ScenarioScoresResponse(
        scenario_id=scenario_id, data_mode=mode, total_tracts=total, scores=scores
    )


@router.get(
    "/scenarios/{scenario_id}/tracts/{tract_geoid}/explain",
    response_model=ScoreExplanationResponse,
)
def explain_score(
    scenario_id: str, tract_geoid: str, settings: Settings = Depends(get_settings)
) -> ScoreExplanationResponse:
    scenario = _get_scenario_or_404(scenario_id)
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_analytics_table(conn, "scenario_scores")
            score_row = conn.execute(
                "SELECT score, coverage_fraction, domains_missing FROM analytics.scenario_scores "
                "WHERE scenario_id = ? AND tract_geoid_2020 = ?",
                [scenario_id, tract_geoid],
            ).fetchone()
            if score_row is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"No score for tract {tract_geoid} under scenario {scenario_id}.",
                )

            contribution_rows = conn.execute(
                """
                SELECT domain, metric_id, label, subdomain, raw_value, unit, direction,
                       percentile, effective_weight, contribution, standard_error,
                       low_confidence_limit, high_confidence_limit, source_id, citation,
                       plain_language_definition, limitations
                FROM analytics.metric_contributions
                WHERE scenario_id = ? AND tract_geoid_2020 = ?
                ORDER BY domain, subdomain, metric_id
                """,
                [scenario_id, tract_geoid],
            ).fetchall()

            domain_score_rows = conn.execute(
                "SELECT domain, score FROM analytics.domain_scores WHERE tract_geoid_2020 = ?",
                [tract_geoid],
            ).fetchall()
            domain_score_by_domain = dict(domain_score_rows)

            confidence_row = conn.execute(
                "SELECT confidence_score, coverage_component, precision_component, "
                "geography_quality_component, freshness_source_component "
                "FROM analytics.data_confidence WHERE scenario_id = ? AND tract_geoid_2020 = ?",
                [scenario_id, tract_geoid],
            ).fetchone()

            stability_row = conn.execute(
                "SELECT stability_label FROM analytics.stability_labels "
                "WHERE scenario_id = ? AND tract_geoid_2020 = ?",
                [scenario_id, tract_geoid],
            ).fetchone()

            mc_row = conn.execute(
                "SELECT median_score, ci_lower, ci_upper, median_rank, rank_ci_lower, "
                "rank_ci_upper, probability_top_decile, probability_top_quartile, n_draws, seed "
                "FROM analytics.monte_carlo_results "
                "WHERE scenario_id = ? AND tract_geoid_2020 = ?",
                [scenario_id, tract_geoid],
            ).fetchone()

            ws_row = conn.execute(
                "SELECT median_rank, rank_ci_lower, rank_ci_upper, rank_std, "
                "probability_top_decile, probability_top_quartile, most_influential_domain, "
                "n_draws, seed FROM analytics.weight_sensitivity_results "
                "WHERE scenario_id = ? AND tract_geoid_2020 = ?",
                [scenario_id, tract_geoid],
            ).fetchone()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    domains_by_domain: dict[str, list[MetricContribution]] = {}
    for r in contribution_rows:
        domains_by_domain.setdefault(r[0], []).append(
            MetricContribution(
                metric_id=r[1],
                label=r[2],
                domain=r[0],
                subdomain=r[3],
                raw_value=r[4],
                unit=r[5],
                direction=r[6],
                percentile=r[7],
                effective_weight=r[8],
                contribution=r[9],
                standard_error=r[10],
                low_confidence_limit=r[11],
                high_confidence_limit=r[12],
                source_id=r[13],
                citation=r[14],
                plain_language_definition=r[15],
                limitations=r[16],
            )
        )

    domain_details = []
    for domain, weight in scenario.weights.items():
        metrics = domains_by_domain.get(domain, [])
        domain_score = domain_score_by_domain.get(domain)
        domain_contribution = sum(m.contribution for m in metrics if m.contribution is not None)
        normalized_weight = sum(m.effective_weight for m in metrics)
        domain_details.append(
            DomainContributionDetail(
                domain=domain,
                domain_score=domain_score,
                configured_weight=weight,
                normalized_weight=normalized_weight,
                contribution=domain_contribution if metrics else None,
                metrics=metrics,
            )
        )

    return ScoreExplanationResponse(
        scenario_id=scenario_id,
        scenario_label=scenario.label,
        tract_geoid_2020=tract_geoid,
        score=score_row[0],
        coverage_fraction=score_row[1],
        domains=domain_details,
        domains_missing=score_row[2].split(";") if score_row[2] else [],
        stability_label=stability_row[0] if stability_row else None,
        data_confidence=(
            DataConfidenceDetail(
                confidence_score=confidence_row[0],
                coverage_component=confidence_row[1],
                precision_component=confidence_row[2],
                geography_quality_component=confidence_row[3],
                freshness_source_component=confidence_row[4],
            )
            if confidence_row
            else None
        ),
        monte_carlo=(
            MonteCarloDetail(
                median_score=mc_row[0],
                ci_lower=mc_row[1],
                ci_upper=mc_row[2],
                median_rank=mc_row[3],
                rank_ci_lower=mc_row[4],
                rank_ci_upper=mc_row[5],
                probability_top_decile=mc_row[6],
                probability_top_quartile=mc_row[7],
                n_draws=mc_row[8],
                seed=mc_row[9],
            )
            if mc_row
            else None
        ),
        weight_sensitivity=(
            WeightSensitivityDetail(
                median_rank=ws_row[0],
                rank_ci_lower=ws_row[1],
                rank_ci_upper=ws_row[2],
                rank_std=ws_row[3],
                probability_top_decile=ws_row[4],
                probability_top_quartile=ws_row[5],
                most_influential_domain=ws_row[6],
                n_draws=ws_row[7],
                seed=ws_row[8],
            )
            if ws_row
            else None
        ),
        data_mode=mode,
    )


@router.get("/scenarios/{scenario_id}/recommendations", response_model=RecommendationsResponse)
def get_recommendations(
    scenario_id: str,
    top_n: int = Query(10, ge=1, le=50),
    settings: Settings = Depends(get_settings),
) -> RecommendationsResponse:
    scenario = _get_scenario_or_404(scenario_id)
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_analytics_table(conn, "scenario_scores")
            top_rows = conn.execute(
                """
                SELECT s.tract_geoid_2020, s.score, s.coverage_fraction,
                       st.stability_label, dc.confidence_score
                FROM analytics.scenario_scores s
                LEFT JOIN analytics.stability_labels st
                  ON s.tract_geoid_2020 = st.tract_geoid_2020 AND s.scenario_id = st.scenario_id
                LEFT JOIN analytics.data_confidence dc
                  ON s.tract_geoid_2020 = dc.tract_geoid_2020 AND s.scenario_id = dc.scenario_id
                WHERE s.scenario_id = ? AND s.score IS NOT NULL
                ORDER BY s.score DESC
                LIMIT ?
                """,
                [scenario_id, top_n],
            ).fetchall()

            recommendations = []
            for rank, row in enumerate(top_rows, start=1):
                tract_geoid = row[0]
                evidence_rows = conn.execute(
                    "SELECT metric_id, label, raw_value, unit, percentile, citation, limitations "
                    "FROM analytics.metric_contributions "
                    "WHERE scenario_id = ? AND tract_geoid_2020 = ? ORDER BY metric_id",
                    [scenario_id, tract_geoid],
                ).fetchall()
                supporting_evidence = [
                    EvidenceItem(
                        metric_id=e[0],
                        label=e[1],
                        raw_value=e[2],
                        unit=e[3],
                        county_percentile=e[4],
                        citation=e[5],
                    )
                    for e in evidence_rows
                ]
                source_provenance = sorted({e[5] for e in evidence_rows})
                limitations = sorted({e[6] for e in evidence_rows if e[6]})

                assumptions = [
                    "This is a county-relative priority screening score (0-100 percentile "
                    "among Santa Clara County tracts), not an absolute clinical threshold or "
                    "a probability of any outcome.",
                    "Domain weights reflect this scenario's configured policy lens, not an "
                    "objectively 'correct' weighting -- see the sensitivity analysis for how "
                    "much the ranking depends on this choice.",
                ]
                straight_line_domains = [
                    d
                    for d in scenario.weights
                    if d in {"resource_accessibility", "workforce_shortage"}
                ]
                if straight_line_domains:
                    assumptions.append(
                        f"Domain(s) {', '.join(sorted(straight_line_domains))} use straight-line "
                        "distance as a screening proxy, not network travel time. Real network-"
                        "routed walking/driving distances are available separately in the "
                        "Access Lab (/api/v1/access/network/*), not blended into this score."
                    )

                recommendations.append(
                    Recommendation(
                        scenario_id=scenario_id,
                        scenario_label=scenario.label,
                        tract_geoid_2020=tract_geoid,
                        rank=rank,
                        score=row[1],
                        coverage_fraction=row[2],
                        stability_label=row[3],
                        confidence_score=row[4],
                        assumptions=assumptions,
                        limitations=limitations,
                        supporting_evidence=supporting_evidence,
                        source_provenance=source_provenance,
                    )
                )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return RecommendationsResponse(
        scenario_id=scenario_id, data_mode=mode, recommendations=recommendations
    )


@router.get("/optimization/runs", response_model=OptimizationRunsResponse)
def list_optimization_runs(settings: Settings = Depends(get_settings)) -> OptimizationRunsResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_analytics_table(conn, "optimization_runs")
            rows = conn.execute(
                """
                SELECT run_id, scenario_label, k_sites, distance_threshold_miles, status,
                       objective_value, selected_sites, population_covered,
                       high_need_population_covered, total_population,
                       total_high_need_population, overlap_count, unserved_high_need_tracts,
                       assumptions, method
                FROM analytics.optimization_runs ORDER BY run_id
                """
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    runs = [
        OptimizationRun(
            run_id=r[0],
            scenario_label=r[1],
            k_sites=r[2],
            distance_threshold_miles=r[3],
            status=r[4],
            objective_value=r[5],
            selected_sites=r[6].split(";") if r[6] else [],
            population_covered=r[7],
            high_need_population_covered=r[8],
            total_population=r[9],
            total_high_need_population=r[10],
            overlap_count=r[11],
            unserved_high_need_tracts=r[12].split(";") if r[12] else [],
            assumptions=r[13].split(" | ") if r[13] else [],
            method=r[14],
        )
        for r in rows
    ]
    return OptimizationRunsResponse(data_mode=mode, runs=runs)


@router.get("/validation/correlation-diagnostics", response_model=CorrelationDiagnosticsResponse)
def list_correlation_diagnostics(
    settings: Settings = Depends(get_settings),
) -> CorrelationDiagnosticsResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_analytics_table(conn, "correlation_diagnostics")
            rows = conn.execute(
                """
                SELECT scenario_id, outcome_label, validity_type, hypothesis, is_tautological,
                       tautology_reason, n_paired_observations, n_missing, spearman_r,
                       spearman_p_value, pearson_r, pearson_p_value, bootstrap_ci_lower,
                       bootstrap_ci_upper, n_bootstrap, interpretation_note
                FROM analytics.correlation_diagnostics ORDER BY scenario_id
                """
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    diagnostics = [
        CorrelationDiagnostic(
            scenario_id=r[0],
            outcome_label=r[1],
            validity_type=r[2],
            hypothesis=r[3],
            is_tautological=r[4],
            tautology_reason=r[5],
            n_paired_observations=r[6],
            n_missing=r[7],
            spearman_r=r[8],
            spearman_p_value=r[9],
            pearson_r=r[10],
            pearson_p_value=r[11],
            bootstrap_ci_lower=r[12],
            bootstrap_ci_upper=r[13],
            n_bootstrap=r[14],
            interpretation_note=r[15],
        )
        for r in rows
    ]
    return CorrelationDiagnosticsResponse(data_mode=mode, diagnostics=diagnostics)
