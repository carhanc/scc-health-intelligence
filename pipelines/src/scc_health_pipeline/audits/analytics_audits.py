"""Phase 4 analytics audit suite -- wired into `make audit`. Implements
the required checks from docs/03_ANALYTICS_METHODS.md §20: `make audit`
must fail when scores fall outside 0-100, a scenario references missing
metrics, uncertainty fields disappear from a source that provides them,
validation reuses score inputs as independent outcomes (tautology guard),
a resource category has zero points without visible status, or a
numeric output lacks provenance.
"""

from __future__ import annotations

from pathlib import Path

import duckdb

from scc_health_pipeline.audits.geography_audits import AuditReport, _fetchone
from scc_health_pipeline.metrics.registry import load_metric_registry
from scc_health_pipeline.scoring.scenarios import (
    load_scenarios,
    load_sensitivity_presets,
    validate_scenarios_against_metric_registry,
)

REPO_ROOT = Path(__file__).resolve().parents[4]
METRICS_CONFIG_PATH = REPO_ROOT / "config" / "metrics.yml"
SCENARIOS_CONFIG_PATH = REPO_ROOT / "config" / "scenarios.yml"

_EXPECTED_ANALYTICS_TABLES = [
    "metric_scores",
    "domain_scores",
    "scenario_scores",
    "data_confidence",
    "monte_carlo_results",
    "weight_sensitivity_results",
    "stability_labels",
    "metric_contributions",
    "preset_scenario_scores",
    "correlation_diagnostics",
    "optimization_runs",
    "workforce_shortage_inputs",
    "resource_accessibility_inputs",
]


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
        [schema, table],
    ).fetchone()
    return bool(row and row[0] > 0)


def run_analytics_audits(warehouse_path: Path) -> AuditReport:
    report = AuditReport()

    if not warehouse_path.exists():
        report.add(
            "analytics_warehouse_exists",
            False,
            f"Warehouse file {warehouse_path} does not exist. Run `make data` first.",
        )
        return report

    conn = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        for table in _EXPECTED_ANALYTICS_TABLES:
            exists = _table_exists(conn, "analytics", table)
            report.add(
                f"analytics_table_exists_{table}",
                exists,
                f"analytics.{table} {
                    'exists' if exists else 'is MISSING -- run the Phase 4 analytics pipeline.'
                }",
            )
        if not all(_table_exists(conn, "analytics", t) for t in _EXPECTED_ANALYTICS_TABLES):
            return report

        _audit_scores_within_bounds(conn, report)
        _audit_metric_score_coverage_not_silently_zero(conn, report)
        _audit_uncertainty_fields_present_when_source_provides_them(conn, report)
        _audit_metric_contributions_have_provenance(conn, report)
        _audit_no_all_null_required_fields(conn, report)
        _audit_resource_categories_not_empty(conn, report)
        _audit_tautology_guard_enforced(conn, report)
        _audit_scenario_references_only_registered_metrics(report)
        _audit_contributions_sum_to_scenario_score(conn, report)
        _audit_monte_carlo_reproducibility_metadata(conn, report)
    finally:
        conn.close()

    return report


def _audit_scores_within_bounds(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (bad_metric_pct,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.metric_scores "
        "WHERE percentile IS NOT NULL AND (percentile < 0 OR percentile > 100)",
    )
    report.add(
        "metric_percentiles_within_0_100",
        bad_metric_pct == 0,
        f"{bad_metric_pct} metric_scores row(s) have a percentile outside [0, 100].",
    )

    (bad_domain,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.domain_scores "
        "WHERE score IS NOT NULL AND (score < 0 OR score > 100)",
    )
    report.add(
        "domain_scores_within_0_100",
        bad_domain == 0,
        f"{bad_domain} domain_scores row(s) have a score outside [0, 100].",
    )

    (bad_scenario,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.scenario_scores "
        "WHERE score IS NOT NULL AND (score < 0 OR score > 100)",
    )
    report.add(
        "scenario_scores_within_0_100",
        bad_scenario == 0,
        f"{bad_scenario} scenario_scores row(s) have a score outside [0, 100].",
    )

    (bad_confidence,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.data_confidence "
        "WHERE confidence_score < 0 OR confidence_score > 1",
    )
    report.add(
        "data_confidence_within_0_1",
        bad_confidence == 0,
        f"{bad_confidence} data_confidence row(s) have confidence_score outside [0, 1].",
    )

    (bad_prob,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.monte_carlo_results "
        "WHERE (probability_top_decile IS NOT NULL "
        "       AND (probability_top_decile < 0 OR probability_top_decile > 1)) "
        "   OR (probability_top_quartile IS NOT NULL "
        "       AND (probability_top_quartile < 0 OR probability_top_quartile > 1))",
    )
    report.add(
        "monte_carlo_probabilities_within_0_1",
        bad_prob == 0,
        f"{bad_prob} monte_carlo_results row(s) have a probability outside [0, 1].",
    )


def _audit_metric_score_coverage_not_silently_zero(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """docs §20: 'score coverage is below threshold without suppression'
    -- a domain below its coverage threshold must have score=NULL, never
    a fabricated 0."""
    (bad,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.domain_scores "
        "WHERE below_coverage_threshold = true AND score IS NOT NULL",
    )
    report.add(
        "below_threshold_domains_have_null_score",
        bad == 0,
        f"{bad} domain_scores row(s) are flagged below_coverage_threshold but still carry "
        "a non-null score (coverage suppression must produce NULL, never a value).",
    )

    (zero_as_missing,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.scenario_scores WHERE coverage_fraction = 0 AND score != 0",
    )
    # informational cross-check: a coverage_fraction of exactly 0 must
    # always pair with score IS NULL, never a literal zero standing in
    # for "no data" -- checked directly below.
    (zero_score_when_no_coverage,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.scenario_scores "
        "WHERE coverage_fraction = 0 AND score IS NOT NULL",
    )
    report.add(
        "zero_coverage_scenarios_have_null_score",
        zero_score_when_no_coverage == 0,
        f"{zero_score_when_no_coverage} scenario_scores row(s) have coverage_fraction=0 but "
        f"a non-null score. ({zero_as_missing} unrelated informational count.)",
    )


def _audit_uncertainty_fields_present_when_source_provides_them(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """docs §20: 'uncertainty fields disappear from a source that
    provides them.' PLACES-sourced metrics must retain low/high
    confidence limits; ACS-ratio metrics must retain a standard error."""
    places_metric_ids = [
        d.metric_id
        for d in load_metric_registry(METRICS_CONFIG_PATH)
        if d.uncertainty_type == "places_ci"
    ]
    if places_metric_ids:
        placeholder = ", ".join(f"'{m}'" for m in places_metric_ids)
        (missing_ci,) = _fetchone(
            conn,
            f"SELECT COUNT(*) FROM analytics.metric_scores "
            f"WHERE metric_id IN ({placeholder}) AND raw_value IS NOT NULL "
            f"AND (low_confidence_limit IS NULL OR high_confidence_limit IS NULL)",
        )
        report.add(
            "places_metrics_retain_confidence_limits",
            missing_ci == 0,
            f"{missing_ci} row(s) among PLACES-sourced (places_ci) metrics have a raw_value "
            "but are missing their confidence-interval bounds.",
        )

    acs_moe_metric_ids = [
        d.metric_id
        for d in load_metric_registry(METRICS_CONFIG_PATH)
        if d.uncertainty_type == "acs_moe"
    ]
    if acs_moe_metric_ids:
        placeholder = ", ".join(f"'{m}'" for m in acs_moe_metric_ids)
        (missing_se,) = _fetchone(
            conn,
            f"SELECT COUNT(*) FROM analytics.metric_scores "
            f"WHERE metric_id IN ({placeholder}) AND raw_value IS NOT NULL "
            f"AND standard_error IS NULL",
        )
        report.add(
            "acs_metrics_retain_standard_error",
            missing_se == 0,
            f"{missing_se} row(s) among ACS-ratio (acs_moe) metrics have a raw_value but are "
            "missing standard_error.",
        )


def _audit_metric_contributions_have_provenance(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """docs §20: 'a numeric output lacks provenance.'"""
    (missing_citation,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.metric_contributions "
        "WHERE citation IS NULL OR citation = '' OR source_id IS NULL OR source_id = ''",
    )
    report.add(
        "metric_contributions_have_provenance",
        missing_citation == 0,
        f"{missing_citation} metric_contributions row(s) are missing a citation or source_id.",
    )


def _audit_no_all_null_required_fields(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    required_by_table = {
        "domain_scores": ["tract_geoid_2020", "domain"],
        "scenario_scores": ["tract_geoid_2020", "scenario_id"],
        "metric_contributions": ["tract_geoid_2020", "scenario_id", "metric_id"],
    }
    for table, columns in required_by_table.items():
        for col in columns:
            (null_count,) = _fetchone(
                conn, f"SELECT COUNT(*) FROM analytics.{table} WHERE {col} IS NULL"
            )
            report.add(
                f"no_null_{table}_{col}",
                null_count == 0,
                f"{null_count} row(s) in analytics.{table} have a null {col}.",
            )


def _audit_resource_categories_not_empty(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """docs §20: 'a resource category has zero points without visible
    status' and 'resource distance fields are all null.'"""
    (n_distance_present,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.resource_accessibility_inputs "
        "WHERE nearest_clinical_care_distance_miles IS NOT NULL",
    )
    report.add(
        "resource_accessibility_not_all_null",
        n_distance_present > 0,
        f"{n_distance_present} of 408 tracts have a nearest_clinical_care_distance_miles "
        "value (expected > 0; a fully-null column would mean zero candidate sites with no "
        "visible status).",
    )

    (n_mua,) = _fetchone(
        conn, "SELECT COUNT(*) FROM analytics.workforce_shortage_inputs WHERE mua_designated = 1"
    )
    report.add(
        "workforce_shortage_has_designated_tracts",
        n_mua > 0,
        f"{n_mua} tracts flagged mua_designated=1 (a value of 0 across all tracts would "
        "warrant investigation, not necessarily a failure, since it could be genuinely true).",
    )


def _audit_tautology_guard_enforced(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    """docs §20 / CLAUDE.md: 'validation reuses score inputs as
    independent outcomes' must never pass silently -- every persisted
    correlation_diagnostics row must have is_tautological = false,
    because a true tautology should have been blocked before a
    correlation was ever computed (see validation/tautology_guard.py)."""
    (tautological_with_computed_r,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.correlation_diagnostics "
        "WHERE is_tautological = true AND spearman_r IS NOT NULL",
    )
    report.add(
        "no_tautological_correlation_has_a_computed_r",
        tautological_with_computed_r == 0,
        f"{tautological_with_computed_r} correlation_diagnostics row(s) are flagged "
        "tautological but still have a computed spearman_r -- the tautology guard must "
        "block computation entirely, not just flag it after the fact.",
    )

    (n_rows,) = _fetchone(conn, "SELECT COUNT(*) FROM analytics.correlation_diagnostics")
    report.add(
        "correlation_diagnostics_present",
        n_rows > 0,
        f"{n_rows} correlation_diagnostics row(s) present.",
    )


def _audit_scenario_references_only_registered_metrics(report: AuditReport) -> None:
    metric_definitions = load_metric_registry(METRICS_CONFIG_PATH)
    known_metric_ids = {d.metric_id for d in metric_definitions}
    known_domains = {d.domain for d in metric_definitions}
    scenarios = load_scenarios(SCENARIOS_CONFIG_PATH)
    problems = validate_scenarios_against_metric_registry(
        scenarios, known_metric_ids, known_domains
    )
    report.add(
        "scenarios_reference_only_registered_metrics",
        len(problems) == 0,
        f"{len(problems)} scenario/metric-registry mismatch(es): {problems or 'none'}.",
    )

    presets = load_sensitivity_presets(SCENARIOS_CONFIG_PATH)
    bad_presets = [p.preset_id for p in presets if any(d not in known_domains for d in p.weights)]
    report.add(
        "presets_reference_only_registered_domains",
        len(bad_presets) == 0,
        f"Presets referencing unknown domains: {bad_presets or 'none'}.",
    )


def _audit_contributions_sum_to_scenario_score(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """Spot-checks that summing analytics.metric_contributions.contribution
    for a given (tract, scenario) reproduces analytics.scenario_scores.score
    -- the same identity verified by unit test in
    test_explainability.py, checked here against real persisted data."""
    rows = conn.execute(
        """
        SELECT c.tract_geoid_2020, c.scenario_id, SUM(c.contribution) AS summed,
               s.score AS scenario_score
        FROM analytics.metric_contributions c
        JOIN analytics.scenario_scores s
          ON c.tract_geoid_2020 = s.tract_geoid_2020 AND c.scenario_id = s.scenario_id
        WHERE s.score IS NOT NULL
        GROUP BY c.tract_geoid_2020, c.scenario_id, s.score
        HAVING ABS(SUM(c.contribution) - s.score) > 0.01
        """
    ).fetchall()
    report.add(
        "metric_contributions_sum_to_scenario_score",
        len(rows) == 0,
        f"{len(rows)} (tract, scenario) pair(s) where summed metric_contributions does not "
        "match the persisted scenario score within tolerance.",
    )


def _audit_monte_carlo_reproducibility_metadata(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """docs §18: every analytical output must carry a random seed and
    draw count for reproducibility."""
    (missing_seed,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.monte_carlo_results "
        "WHERE seed IS NULL OR n_draws IS NULL OR n_draws <= 0",
    )
    report.add(
        "monte_carlo_results_carry_seed_and_draw_count",
        missing_seed == 0,
        f"{missing_seed} monte_carlo_results row(s) are missing a seed or valid n_draws.",
    )
