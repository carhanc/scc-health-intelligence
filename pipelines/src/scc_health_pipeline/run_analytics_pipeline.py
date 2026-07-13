"""Phase 4 orchestration: metric evaluation -> domain scores -> scenario
scores -> uncertainty propagation -> sensitivity -> explainability ->
validation diagnostics -> location-allocation optimization, all loaded
into the `analytics` warehouse schema. Wired into `make data` after the
Phase 3 core-sources pipeline (analytics depends on Phase 3's tables).

Every number persisted here is produced by a tested pure-logic module
under pipelines/src/scc_health_pipeline/{metrics,scoring,uncertainty,
validation,optimization}/ (see pipelines/tests/test_*.py) -- the API
layer reads these already-computed tables directly rather than
re-deriving analytics logic itself, so every number the product shows a
user traces to this one, tested code path (see DEC-030).

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_analytics_pipeline
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb
import polars as pl

from scc_health_pipeline.metrics.precomputed_geospatial import (
    compute_resource_accessibility_inputs,
    compute_workforce_shortage_inputs,
)
from scc_health_pipeline.metrics.registry import (
    evaluate_metric,
    load_metric_registry,
    validate_registry_against_warehouse,
)
from scc_health_pipeline.optimization.location_allocation import (
    CandidateSite,
    DemandPoint,
    run_maximal_covering_location,
)
from scc_health_pipeline.scoring.data_confidence import compute_data_confidence
from scc_health_pipeline.scoring.domain_scores import (
    DomainScoreResult,
    compute_domain_scores,
    compute_metric_scores,
    compute_subdomain_scores,
)
from scc_health_pipeline.scoring.explainability import build_score_explanation
from scc_health_pipeline.scoring.scenario_scores import compute_scenario_score
from scc_health_pipeline.scoring.scenarios import (
    load_scenarios,
    load_sensitivity_presets,
    validate_scenarios_against_metric_registry,
)
from scc_health_pipeline.scoring.sensitivity import (
    classify_stability,
    compute_preset_sensitivity,
    compute_weight_sensitivity,
)
from scc_health_pipeline.sources.manifest import load_manifest
from scc_health_pipeline.uncertainty.monte_carlo import MonteCarloConfig, run_monte_carlo
from scc_health_pipeline.validation.correlation_diagnostics import run_correlation_diagnostic

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"
METRICS_CONFIG_PATH = REPO_ROOT / "config" / "metrics.yml"
SCENARIOS_CONFIG_PATH = REPO_ROOT / "config" / "scenarios.yml"

MC_DRAWS = 500
MC_SEED = 42
SENSITIVITY_DRAWS = 1000
SENSITIVITY_SEED = 42
TOP_TRANSIT_STOP_CANDIDATES = 50


def main() -> int:  # noqa: PLR0915 -- orchestration script, sequential by design
    if not WAREHOUSE_PATH.exists():
        print(
            "warehouse/scc_health.duckdb does not exist -- run the Phase 2/3 pipelines "
            "(run_geography_pipeline, run_core_sources_pipeline) first."
        )
        return 1

    conn = duckdb.connect(str(WAREHOUSE_PATH), read_only=False)
    conn.execute("INSTALL spatial")
    conn.execute("LOAD spatial")
    conn.execute("CREATE SCHEMA IF NOT EXISTS analytics")

    print("Precomputing geospatial metric inputs (workforce/resource accessibility)...")
    workforce_df, workforce_diag = compute_workforce_shortage_inputs(conn)
    resource_df, resource_diag = compute_resource_accessibility_inputs(conn)
    _write_table(conn, "analytics", "workforce_shortage_inputs", workforce_df)
    _write_table(conn, "analytics", "resource_accessibility_inputs", resource_df)
    print(f"  workforce: {workforce_diag}")
    print(f"  resource: {resource_diag}")

    print("Loading metric registry...")
    metric_definitions = load_metric_registry(METRICS_CONFIG_PATH)
    problems = validate_registry_against_warehouse(conn, metric_definitions)
    if problems:
        print("Metric registry validation FAILED:")
        for p in problems:
            print(f"  - {p}")
        conn.close()
        return 1
    print(f"  {len(metric_definitions)} metrics validated against the warehouse.")

    all_tracts = [
        r[0] for r in conn.execute("SELECT tract_geoid_2020 FROM geo.tracts ORDER BY 1").fetchall()
    ]

    print("Evaluating metrics...")
    raw_metric_data: dict[str, pl.DataFrame] = {}
    metric_scores_all = []
    metric_coverage_by_id = {}
    for d in metric_definitions:
        df = evaluate_metric(conn, d)
        raw_metric_data[d.metric_id] = df
        metric_score_results, coverage = compute_metric_scores(df, d)
        metric_coverage_by_id[d.metric_id] = coverage
        metric_scores_all.extend(metric_score_results)
        status = "included" if coverage.included else f"EXCLUDED ({coverage.reason_excluded})"
        print(f"  {d.metric_id}: coverage {coverage.coverage_fraction:.1%} -- {status}")

    metric_scores_df = pl.DataFrame(
        [
            {
                "tract_geoid_2020": m.tract_geoid_2020,
                "metric_id": m.metric_id,
                "domain": m.domain,
                "subdomain": m.subdomain,
                "raw_value": m.raw_value,
                "concern_value": m.concern_value,
                "percentile": m.percentile,
                "standard_error": m.standard_error,
                "low_confidence_limit": m.low_confidence_limit,
                "high_confidence_limit": m.high_confidence_limit,
            }
            for m in metric_scores_all
        ],
        schema={
            "tract_geoid_2020": pl.Utf8,
            "metric_id": pl.Utf8,
            "domain": pl.Utf8,
            "subdomain": pl.Utf8,
            "raw_value": pl.Float64,
            "concern_value": pl.Float64,
            "percentile": pl.Float64,
            "standard_error": pl.Float64,
            "low_confidence_limit": pl.Float64,
            "high_confidence_limit": pl.Float64,
        },
    )
    _write_table(conn, "analytics", "metric_scores", metric_scores_df)

    print("Computing subdomain and domain scores...")
    subdomain_scores = compute_subdomain_scores(metric_scores_all)
    domain_scores = compute_domain_scores(subdomain_scores)
    domain_scores_df = _rows_to_df(
        [
            {
                "tract_geoid_2020": d.tract_geoid_2020,
                "domain": d.domain,
                "score": d.score,
                "coverage_fraction": d.coverage_fraction,
                "n_subdomains_present": d.n_subdomains_present,
                "n_subdomains_total": d.n_subdomains_total,
                "subdomains_present": ";".join(d.subdomains_present),
                "subdomains_missing": ";".join(d.subdomains_missing),
                "below_coverage_threshold": d.below_coverage_threshold,
            }
            for d in domain_scores
        ]
    )
    _write_table(conn, "analytics", "domain_scores", domain_scores_df)

    domain_results_by_domain_and_tract: dict[str, dict[str, DomainScoreResult]] = {}
    for domain_score in domain_scores:
        domain_results_by_domain_and_tract.setdefault(domain_score.domain, {})[
            domain_score.tract_geoid_2020
        ] = domain_score

    print("Loading scenarios and sensitivity presets...")
    scenarios = load_scenarios(SCENARIOS_CONFIG_PATH)
    presets = load_sensitivity_presets(SCENARIOS_CONFIG_PATH)
    known_metric_ids = {d.metric_id for d in metric_definitions}
    known_domains = {d.domain for d in metric_definitions}
    scenario_problems = validate_scenarios_against_metric_registry(
        scenarios, known_metric_ids, known_domains
    )
    if scenario_problems:
        print("Scenario validation FAILED:")
        for p in scenario_problems:
            print(f"  - {p}")
        conn.close()
        return 1
    print(f"  {len(scenarios)} scenarios, {len(presets)} sensitivity presets validated.")

    manifest_entries = load_manifest()
    manifest_by_source_id = {e["source_id"]: e for e in manifest_entries}
    metric_defs_by_id = {d.metric_id: d for d in metric_definitions}

    scenario_score_rows = []
    confidence_rows = []
    mc_rows = []
    sensitivity_rows = []
    stability_rows = []
    contribution_rows = []

    for scenario in scenarios:
        print(f"Scoring scenario '{scenario.scenario_id}'...")
        scenario_results = []
        for tract in all_tracts:
            domain_results_for_tract = {
                domain: by_tract[tract]
                for domain, by_tract in domain_results_by_domain_and_tract.items()
                if tract in by_tract
            }
            scenario_score_result = compute_scenario_score(
                scenario, domain_results_for_tract, tract
            )
            scenario_results.append(scenario_score_result)
            scenario_score_rows.append(
                {
                    "tract_geoid_2020": tract,
                    "scenario_id": scenario.scenario_id,
                    "score": scenario_score_result.score,
                    "coverage_fraction": scenario_score_result.coverage_fraction,
                    "domains_missing": ";".join(scenario_score_result.domains_missing),
                }
            )

        contributing_metrics = [d for d in metric_definitions if d.domain in scenario.weights]

        mc_results = run_monte_carlo(
            scenario,
            metric_definitions,
            raw_metric_data,
            all_tracts,
            MonteCarloConfig(n_draws=MC_DRAWS, seed=MC_SEED),
        )
        mc_by_tract = {mc.tract_geoid_2020: mc for mc in mc_results}
        for mc in mc_results:
            mc_rows.append(
                {
                    "tract_geoid_2020": mc.tract_geoid_2020,
                    "scenario_id": mc.scenario_id,
                    "median_score": mc.median_score,
                    "ci_lower": mc.ci_lower,
                    "ci_upper": mc.ci_upper,
                    "median_rank": mc.median_rank,
                    "rank_ci_lower": mc.rank_ci_lower,
                    "rank_ci_upper": mc.rank_ci_upper,
                    "probability_top_decile": mc.probability_top_decile,
                    "probability_top_quartile": mc.probability_top_quartile,
                    "n_draws": mc.n_draws,
                    "seed": mc.seed,
                }
            )

        weight_sensitivity_results = compute_weight_sensitivity(
            scenario,
            domain_results_by_domain_and_tract,
            all_tracts,
            n_draws=SENSITIVITY_DRAWS,
            seed=SENSITIVITY_SEED,
        )
        ws_by_tract = {ws.tract_geoid_2020: ws for ws in weight_sensitivity_results}
        for ws in weight_sensitivity_results:
            sensitivity_rows.append(
                {
                    "tract_geoid_2020": ws.tract_geoid_2020,
                    "scenario_id": ws.scenario_id,
                    "median_rank": ws.median_rank,
                    "rank_ci_lower": ws.rank_ci_lower,
                    "rank_ci_upper": ws.rank_ci_upper,
                    "rank_std": ws.rank_std,
                    "probability_top_decile": ws.probability_top_decile,
                    "probability_top_quartile": ws.probability_top_quartile,
                    "most_influential_domain": ws.most_influential_domain,
                    "n_draws": ws.n_draws,
                    "seed": ws.seed,
                }
            )

        scenario_results_by_tract = {r.tract_geoid_2020: r for r in scenario_results}
        for tract in all_tracts:
            domain_results_for_tract = {
                domain: by_tract[tract]
                for domain, by_tract in domain_results_by_domain_and_tract.items()
                if tract in by_tract
            }
            scenario_result = scenario_results_by_tract[tract]

            confidence = compute_data_confidence(
                tract,
                scenario.scenario_id,
                scenario.weights,
                domain_results_for_tract,
                contributing_metrics,
                metric_coverage_by_id,
                manifest_by_source_id,
            )
            confidence_rows.append(
                {
                    "tract_geoid_2020": tract,
                    "scenario_id": scenario.scenario_id,
                    "confidence_score": confidence.confidence_score,
                    "coverage_component": confidence.coverage_component,
                    "precision_component": confidence.precision_component,
                    "geography_quality_component": confidence.geography_quality_component,
                    "freshness_source_component": confidence.freshness_source_component,
                }
            )

            ws_result = ws_by_tract.get(tract)
            stability = classify_stability(
                ws_result.probability_top_decile if ws_result else None,
                confidence.confidence_score,
            )
            stability_rows.append(
                {
                    "tract_geoid_2020": tract,
                    "scenario_id": scenario.scenario_id,
                    "stability_label": stability,
                }
            )

            subdomains_present_by_domain = {
                dom: [
                    s.subdomain
                    for s in subdomain_scores
                    if s.domain == dom and s.tract_geoid_2020 == tract and s.score is not None
                ]
                for dom in scenario.weights
            }
            subdomains_missing_by_domain = {
                dom: [
                    s.subdomain
                    for s in subdomain_scores
                    if s.domain == dom and s.tract_geoid_2020 == tract and s.score is None
                ]
                for dom in scenario.weights
            }
            tract_metric_scores = [
                m
                for m in metric_scores_all
                if m.tract_geoid_2020 == tract and m.domain in scenario.weights
            ]

            explanation = build_score_explanation(
                scenario,
                scenario_result,
                tract_metric_scores,
                metric_defs_by_id,
                subdomains_present_by_domain,
                subdomains_missing_by_domain,
                data_confidence=confidence,
                stability_label=stability,
                monte_carlo=mc_by_tract.get(tract),
            )

            for dom_exp in explanation.domains:
                for m in dom_exp.metrics:
                    contribution_rows.append(
                        {
                            "tract_geoid_2020": tract,
                            "scenario_id": scenario.scenario_id,
                            "metric_id": m.metric_id,
                            "label": m.label,
                            "domain": m.domain,
                            "subdomain": m.subdomain,
                            "raw_value": m.raw_value,
                            "unit": m.unit,
                            "direction": m.direction,
                            "percentile": m.percentile,
                            "effective_weight": m.effective_weight,
                            "contribution": m.contribution,
                            "standard_error": m.standard_error,
                            "low_confidence_limit": m.low_confidence_limit,
                            "high_confidence_limit": m.high_confidence_limit,
                            "source_id": m.source_id,
                            "citation": m.citation,
                            "plain_language_definition": m.plain_language_definition,
                            "limitations": m.limitations,
                        }
                    )

    _write_table(conn, "analytics", "scenario_scores", _rows_to_df(scenario_score_rows))
    _write_table(conn, "analytics", "data_confidence", _rows_to_df(confidence_rows))
    _write_table(conn, "analytics", "monte_carlo_results", _rows_to_df(mc_rows))
    _write_table(conn, "analytics", "weight_sensitivity_results", _rows_to_df(sensitivity_rows))
    _write_table(conn, "analytics", "stability_labels", _rows_to_df(stability_rows))
    _write_table(conn, "analytics", "metric_contributions", _rows_to_df(contribution_rows))

    print("Computing preset sensitivity (scenario-independent, 5 named weightings)...")
    preset_results = compute_preset_sensitivity(
        presets, domain_results_by_domain_and_tract, all_tracts
    )
    preset_df = _rows_to_df(
        [
            {
                "preset_id": r.preset_id,
                "tract_geoid_2020": r.tract_geoid_2020,
                "score": r.score,
                "rank": r.rank,
            }
            for r in preset_results
        ]
    )
    _write_table(conn, "analytics", "preset_scenario_scores", preset_df)

    print("Running correlation diagnostics (convergent validity vs. CDC/ATSDR SVI)...")
    svi_rows = conn.execute(
        "SELECT tract_geoid_2020, RPL_THEMES FROM context.svi WHERE RPL_THEMES IS NOT NULL"
    ).fetchall()
    svi_values = {t: float(v) for t, v in svi_rows}
    scenario_scores_by_id: dict[str, dict[str, float]] = {}
    for row in scenario_score_rows:
        if row["score"] is not None:
            scenario_scores_by_id.setdefault(row["scenario_id"], {})[row["tract_geoid_2020"]] = row[
                "score"
            ]

    correlation_rows = []
    for scenario in scenarios:
        tract_scores = scenario_scores_by_id.get(scenario.scenario_id, {})
        correlation_result = run_correlation_diagnostic(
            scenario,
            metric_definitions,
            hypothesis=(
                f"Tracts with a higher '{scenario.label}' priority score also tend to rank "
                "higher on CDC/ATSDR SVI's overall social vulnerability percentile "
                "(convergent validity, not causal validation)."
            ),
            tract_scores=tract_scores,
            outcome_values=svi_values,
            outcome_label="CDC/ATSDR SVI overall percentile (RPL_THEMES)",
            outcome_source_table="context.svi",
            outcome_source_field="RPL_THEMES",
        )
        correlation_rows.append(
            {
                "scenario_id": correlation_result.scenario_id,
                "outcome_label": correlation_result.outcome_label,
                "validity_type": correlation_result.validity_type,
                "hypothesis": correlation_result.hypothesis,
                "is_tautological": correlation_result.is_tautological,
                "tautology_reason": correlation_result.tautology_reason,
                "n_paired_observations": correlation_result.n_paired_observations,
                "n_missing": correlation_result.n_missing,
                "spearman_r": correlation_result.spearman_r,
                "spearman_p_value": correlation_result.spearman_p_value,
                "pearson_r": correlation_result.pearson_r,
                "pearson_p_value": correlation_result.pearson_p_value,
                "bootstrap_ci_lower": correlation_result.bootstrap_ci_lower,
                "bootstrap_ci_upper": correlation_result.bootstrap_ci_upper,
                "n_bootstrap": correlation_result.n_bootstrap,
                "interpretation_note": correlation_result.interpretation_note,
            }
        )
        print(
            f"  {scenario.scenario_id}: spearman_r={correlation_result.spearman_r}, "
            f"n={correlation_result.n_paired_observations}, "
            f"tautological={correlation_result.is_tautological}"
        )
    _write_table(conn, "analytics", "correlation_diagnostics", _rows_to_df(correlation_rows))

    print("Running location-allocation optimization (mobile-clinic siting scenario)...")
    stop_rows = conn.execute(
        f"""
        SELECT stop_id, stop_name, stop_lat, stop_lon
        FROM resources.transit_stop_frequency_summary
        ORDER BY distinct_trips_serving_stop DESC
        LIMIT {TOP_TRANSIT_STOP_CANDIDATES}
        """
    ).fetchall()
    candidate_sites = [
        CandidateSite(str(sid), f"{name} (stop {sid})", float(lat), float(lon))
        for sid, name, lat, lon in stop_rows
    ]

    population_by_tract = {
        r[0]: float(r[1])
        for r in conn.execute(
            "SELECT tract_geoid_2020, estimate FROM social.acs_observations "
            "WHERE variable_id = 'B01003_E001'"
        ).fetchall()
    }
    health_burden_by_tract = {
        d.tract_geoid_2020: d.score for d in domain_scores if d.domain == "health_burden"
    }
    tract_points = conn.execute(
        "SELECT tract_geoid_2020, internal_point_lat, internal_point_lon FROM geo.tracts"
    ).fetchall()
    demand_points = [
        DemandPoint(
            tract_geoid_2020=t,
            lat=float(lat),
            lon=float(lon),
            population=population_by_tract.get(t, 0.0),
            need_weight=(health_burden_by_tract.get(t) or 0.0) / 100.0,
        )
        for t, lat, lon in tract_points
    ]

    # Sensitivity/robustness sweep (Phase 6 spec): vary k_sites, distance
    # threshold, and whether an equity constraint is applied, so the
    # Access Lab can show which siting conclusions are stable across
    # reasonable parameter choices and which are assumption-sensitive.
    # run_id encodes every varied parameter so the API/UI can group and
    # label runs without re-deriving the scenario from raw numbers.
    _OPTIMIZATION_SCENARIOS: list[tuple[str, int, float, float | None]] = [
        ("baseline", 5, 2.0, 0.5),
        ("more_sites", 10, 2.0, 0.5),
        ("tight_threshold", 10, 1.0, 0.5),
        ("no_equity_constraint", 5, 2.0, None),
        ("walk_plausible_threshold", 5, 0.5, None),
        ("larger_network", 15, 2.0, 0.5),
    ]
    optimization_rows = []
    for scenario_key, k_sites, threshold, equity in _OPTIMIZATION_SCENARIOS:
        optimization_result = run_maximal_covering_location(
            candidate_sites,
            demand_points,
            k_sites=k_sites,
            distance_threshold_miles=threshold,
            equity_min_coverage_fraction=equity,
        )
        optimization_rows.append(
            {
                "run_id": f"mobile_clinic_{scenario_key}",
                "scenario_label": (
                    f"Mobile clinic siting -- {scenario_key.replace('_', ' ')} "
                    "(health_burden-weighted, transit-hub candidates)"
                ),
                "k_sites": optimization_result.k_sites,
                "distance_threshold_miles": optimization_result.distance_threshold_miles,
                "status": optimization_result.status,
                "objective_value": optimization_result.objective_value,
                "selected_sites": ";".join(optimization_result.selected_sites),
                "population_covered": optimization_result.population_covered,
                "high_need_population_covered": optimization_result.high_need_population_covered,
                "total_population": optimization_result.total_population,
                "total_high_need_population": optimization_result.total_high_need_population,
                "overlap_count": optimization_result.overlap_count,
                "unserved_high_need_tracts": ";".join(
                    optimization_result.unserved_high_need_tracts
                ),
                "assumptions": " | ".join(optimization_result.assumptions),
                "method": optimization_result.method,
            }
        )
        print(
            f"  {scenario_key}: k={k_sites}, threshold={threshold}mi, equity={equity}: "
            f"status={optimization_result.status}, "
            f"population_covered={optimization_result.population_covered:.0f}"
        )
    _write_table(conn, "analytics", "optimization_runs", _rows_to_df(optimization_rows))

    now = datetime.now(UTC).isoformat()
    conn.execute("CREATE SCHEMA IF NOT EXISTS meta")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS meta.builds (
            build_id VARCHAR PRIMARY KEY, started_at VARCHAR NOT NULL,
            finished_at VARCHAR, phase VARCHAR NOT NULL, notes VARCHAR
        )
        """
    )
    build_id = f"phase4-{now}"
    conn.execute(
        "INSERT OR REPLACE INTO meta.builds (build_id, started_at, finished_at, phase, notes) "
        "VALUES (?, ?, ?, ?, ?)",
        [
            build_id,
            now,
            now,
            "phase_4_analytics",
            f"{len(metric_definitions)} metrics, {len(scenarios)} scenarios, "
            f"MC={MC_DRAWS} draws, sensitivity={SENSITIVITY_DRAWS} draws",
        ],
    )

    conn.close()
    print("\nAnalytics pipeline complete.")
    return 0


def _rows_to_df(rows: list[dict[str, Any]]) -> pl.DataFrame:
    """Builds a DataFrame from a list of row-dicts with a full schema
    scan (infer_schema_length=None), not Polars' default 100-row sample.
    Several tables here mix metric types whose optional numeric fields
    (e.g. standard_error, present only for ACS-derived metrics) are None
    in early rows and a real float only many rows later -- sampling only
    the first 100 rows can infer the wrong column type and then crash
    when it hits the real value (hit during Phase 4 live-pipeline
    verification: "could not append value: 2.700176 of type: f64")."""
    if not rows:
        return pl.DataFrame(rows)
    return pl.DataFrame(rows, infer_schema_length=None)


def _write_table(
    conn: duckdb.DuckDBPyConnection, schema: str, table: str, df: pl.DataFrame
) -> None:
    conn.execute(f"DROP TABLE IF EXISTS {schema}.{table}")
    conn.register("_tmp_df", df)
    conn.execute(f"CREATE TABLE {schema}.{table} AS SELECT * FROM _tmp_df")
    conn.unregister("_tmp_df")
    count = conn.execute(f"SELECT COUNT(*) FROM {schema}.{table}").fetchone()
    print(f"  loaded {schema}.{table}: {count[0] if count else 0} rows")


if __name__ == "__main__":
    sys.exit(main())
