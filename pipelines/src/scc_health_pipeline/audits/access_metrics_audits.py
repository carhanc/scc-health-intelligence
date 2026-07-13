"""Phase 6 access-metrics audit suite -- wired into `make audit`.

Checks the batch-computed `analytics.{network_access_metrics,
transit_access_metrics, e2sfca_accessibility}` tables (produced by
`run_access_metrics_pipeline.py`) for the integrity properties this
phase's non-negotiable rules require: no unexplained missing values, no
straight-line result mislabeled as network-routed, no static-transit
result mislabeled real-time, capacity-aware and count-proxy E2SFCA
results kept distinct, and complete origin x mode x category coverage
(every requested combination present, even if `status="unavailable"`).
"""

from __future__ import annotations

from pathlib import Path

import duckdb

from scc_health_pipeline.audits.geography_audits import AuditReport, _fetchone


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    (count,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM information_schema.tables "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}'",
    )
    return bool(count)


def run_access_metrics_audits(warehouse_path: Path) -> AuditReport:
    report = AuditReport()
    if not warehouse_path.exists():
        report.add("warehouse_present", False, f"No warehouse found at {warehouse_path}.")
        return report

    conn = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        for table in ("network_access_metrics", "transit_access_metrics", "e2sfca_accessibility"):
            if not _table_exists(conn, "analytics", table):
                report.add(
                    f"{table}_present", False,
                    f"analytics.{table} not found -- run `run_access_metrics_pipeline` "
                    "before auditing.",
                )
        if not report.passed:
            return report

        (n_network,) = _fetchone(conn, "SELECT COUNT(*) FROM analytics.network_access_metrics")
        report.add("network_access_metrics_nonzero", n_network > 0, f"{n_network} rows.")

        (n_origins,) = _fetchone(
            conn, "SELECT COUNT(DISTINCT block_group_geoid) FROM geo.block_group_population_origins"
        )
        (n_covered_combos,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM ("
            "  SELECT DISTINCT block_group_geoid, mode, category "
            "  FROM analytics.network_access_metrics"
            ")",
        )
        expected_combos = n_origins * 2 * 2  # 2 modes x 2 categories
        report.add(
            "network_access_metrics_complete_coverage",
            n_covered_combos == expected_combos,
            f"{n_covered_combos} of {expected_combos} expected (origin, mode, category) "
            "combinations present (every origin gets one row per mode per category, "
            "'unavailable' included -- never a silently missing combination).",
        )

        (n_routed_missing_distance,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM analytics.network_access_metrics "
            "WHERE status = 'routed' AND distance_miles IS NULL",
        )
        report.add(
            "network_access_metrics_routed_rows_have_distance",
            n_routed_missing_distance == 0,
            f"{n_routed_missing_distance} 'routed' rows have a null distance_miles."
            if n_routed_missing_distance
            else "Every 'routed' row has a non-null distance_miles.",
        )

        (n_unavailable_missing_reason,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM analytics.network_access_metrics "
            "WHERE status = 'unavailable' AND "
            "(unavailable_reason IS NULL OR unavailable_reason = '')",
        )
        report.add(
            "network_access_metrics_unavailable_rows_explain_why",
            n_unavailable_missing_reason == 0,
            f"{n_unavailable_missing_reason} 'unavailable' rows have no stated reason."
            if n_unavailable_missing_reason
            else "Every 'unavailable' row states a reason.",
        )

        (n_mislabeled_straight_line,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM analytics.network_access_metrics "
            "WHERE method LIKE '%straight_line%'",
        )
        report.add(
            "network_access_metrics_never_mislabels_straight_line_as_network",
            n_mislabeled_straight_line == 0,
            f"{n_mislabeled_straight_line} rows carry a straight-line method label in the "
            "network-routed table." if n_mislabeled_straight_line
            else "No row in the network-routed table carries a straight-line method label.",
        )

        (n_transit,) = _fetchone(conn, "SELECT COUNT(*) FROM analytics.transit_access_metrics")
        report.add("transit_access_metrics_nonzero", n_transit > 0, f"{n_transit} rows.")

        (n_transit_mislabeled,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM analytics.transit_access_metrics "
            "WHERE method != 'scheduled_transit_access_proxy'",
        )
        report.add(
            "transit_access_metrics_all_carry_the_proxy_label",
            n_transit_mislabeled == 0,
            f"{n_transit_mislabeled} transit rows do not carry the "
            "'scheduled_transit_access_proxy' method label (risk of appearing real-time)."
            if n_transit_mislabeled
            else "Every transit row carries the 'scheduled_transit_access_proxy' label.",
        )

        (n_e2sfca,) = _fetchone(conn, "SELECT COUNT(*) FROM analytics.e2sfca_accessibility")
        report.add("e2sfca_accessibility_nonzero", n_e2sfca > 0, f"{n_e2sfca} rows.")

        (n_negative_or_null_scores,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM analytics.e2sfca_accessibility "
            "WHERE accessibility_score IS NULL OR accessibility_score < 0",
        )
        report.add(
            "e2sfca_scores_never_negative_or_null",
            n_negative_or_null_scores == 0,
            f"{n_negative_or_null_scores} rows have a null or negative accessibility_score."
            if n_negative_or_null_scores
            else "Every e2sfca_accessibility score is a non-negative, non-null number.",
        )

        (n_capacity_type_mixed,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM ("
            "  SELECT category, COUNT(DISTINCT capacity_type) AS n_types "
            "  FROM analytics.e2sfca_accessibility GROUP BY category"
            ") WHERE n_types > 1",
        )
        report.add(
            "e2sfca_capacity_type_consistent_within_category",
            n_capacity_type_mixed == 0,
            f"{n_capacity_type_mixed} categories mix real_capacity and count_proxy rows "
            "(capacity-aware and count-proxy results must stay distinct per category, "
            "never silently combined)." if n_capacity_type_mixed
            else "Every category uses exactly one capacity_type consistently "
            "(capacity-aware and count-proxy results are never mixed).",
        )

        hospital_capacity_type = conn.execute(
            "SELECT DISTINCT capacity_type FROM analytics.e2sfca_accessibility "
            "WHERE category = 'hospital'"
        ).fetchall()
        report.add(
            "e2sfca_hospital_uses_real_capacity_not_a_fabricated_proxy",
            hospital_capacity_type == [("real_capacity",)],
            f"Hospital category capacity_type(s): {hospital_capacity_type} "
            "(expected exactly ['real_capacity'] -- real HCAI licensed-bed counts, "
            "never inferred from facility type alone).",
        )

        return report
    finally:
        conn.close()
