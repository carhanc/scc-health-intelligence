"""Phase 7 utilization audit suite -- wired into `make audit`. Checks
the HCAI ED-utilization tables (`run_utilization_pipeline.py`) for
exactly the failure modes CLAUDE.md and the Phase 7 spec call out:
suppression rendered as a literal zero, a modeled quantity presented
without its method/quality label, a GEOID losing a leading zero, an
allocation that manufactures encounters that were never observed, or a
tautological criterion-validity check slipping through un-flagged.
"""

from __future__ import annotations

from pathlib import Path

import duckdb

from scc_health_pipeline.audits.geography_audits import AuditReport, _fetchone

_EXPECTED_TABLES = [
    "utilization_ed_zip_observed",
    "utilization_ed_tract_modeled",
    "utilization_ed_facility_summary",
    "utilization_ed_county_trends",
    "utilization_access_vs_utilization",
    "utilization_criterion_validity",
]


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
        [schema, table],
    ).fetchone()
    return bool(row and row[0] > 0)


def run_utilization_audits(warehouse_path: Path) -> AuditReport:
    report = AuditReport()

    if not warehouse_path.exists():
        report.add(
            "utilization_warehouse_exists",
            False,
            f"Warehouse file {warehouse_path} does not exist. Run `make data` first.",
        )
        return report

    conn = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        for table in _EXPECTED_TABLES:
            exists = _table_exists(conn, "analytics", table)
            report.add(
                f"utilization_table_exists_{table}",
                exists,
                f"analytics.{table} "
                f"{'exists' if exists else 'is MISSING -- run run_utilization_pipeline.'}",
            )
        if not all(_table_exists(conn, "analytics", t) for t in _EXPECTED_TABLES):
            return report

        _audit_geoid_and_zip_format(conn, report)
        _audit_row_uniqueness(conn, report)
        _audit_suppression_never_rendered_as_zero(conn, report)
        _audit_modeled_rows_carry_method_and_quality(conn, report)
        _audit_allocation_conserves_observed_totals(conn, report)
        _audit_no_negative_counts_or_rates(conn, report)
        _audit_facility_totals_resolved(conn, report)
        _audit_criterion_validity_not_tautological(conn, report)
        _audit_observed_vs_modeled_labeled_on_every_row(conn, report)
        _audit_implausible_rates_are_flagged(conn, report)
    finally:
        conn.close()

    return report


def _audit_geoid_and_zip_format(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (bad_tract,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_tract_modeled "
        "WHERE LENGTH(tract_geoid_2020) != 11 OR tract_geoid_2020 NOT LIKE '06085%'",
    )
    report.add(
        "utilization_tract_geoids_well_formed",
        bad_tract == 0,
        f"{bad_tract} utilization_ed_tract_modeled row(s) have a malformed tract_geoid_2020 "
        "(expected 11 characters, '06085' county prefix).",
    )

    (bad_zip,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_zip_observed WHERE LENGTH(patient_zip) != 5",
    )
    report.add(
        "utilization_zip_codes_five_characters",
        bad_zip == 0,
        f"{bad_zip} utilization_ed_zip_observed row(s) have a patient_zip that is not exactly "
        "5 characters (a leading-zero ZIP, e.g. '02120', collapsing to a 4-digit number would "
        "show up here).",
    )


def _audit_row_uniqueness(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (dup_zip,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM ("
        "  SELECT patient_zip, pattype_group, COUNT(*) c "
        "  FROM analytics.utilization_ed_zip_observed GROUP BY 1, 2 HAVING c > 1"
        ")",
    )
    report.add(
        "utilization_zip_observed_unique_key",
        dup_zip == 0,
        f"{dup_zip} duplicate (patient_zip, pattype_group) key(s) in utilization_ed_zip_observed.",
    )

    (dup_tract,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM ("
        "  SELECT tract_geoid_2020, pattype_group, COUNT(*) c "
        "  FROM analytics.utilization_ed_tract_modeled GROUP BY 1, 2 HAVING c > 1"
        ")",
    )
    report.add(
        "utilization_tract_modeled_unique_key",
        dup_tract == 0,
        f"{dup_tract} duplicate (tract_geoid_2020, pattype_group) key(s) in "
        "utilization_ed_tract_modeled.",
    )

    (dup_facility,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM ("
        "  SELECT oshpd_id, COUNT(*) c FROM analytics.utilization_ed_facility_summary "
        "  GROUP BY 1 HAVING c > 1"
        ")",
    )
    report.add(
        "utilization_facility_summary_unique_oshpd_id",
        dup_facility == 0,
        f"{dup_facility} duplicate oshpd_id in utilization_ed_facility_summary.",
    )

    (n_access,) = _fetchone(
        conn,
        "SELECT COUNT(DISTINCT tract_geoid_2020) FROM analytics.utilization_access_vs_utilization",
    )
    (n_total,) = _fetchone(
        conn, "SELECT COUNT(*) FROM analytics.utilization_access_vs_utilization"
    )
    report.add(
        "utilization_access_vs_utilization_one_row_per_tract",
        n_access == n_total,
        f"{n_total} rows but only {n_access} distinct tracts in utilization_access_vs_utilization "
        "-- expected exactly one row per tract.",
    )


def _audit_suppression_never_rendered_as_zero(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    (bad,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_county_trends "
        "WHERE is_suppressed = true AND encounters IS NOT NULL",
    )
    report.add(
        "county_trends_suppressed_rows_are_null_not_zero",
        bad == 0,
        f"{bad} utilization_ed_county_trends row(s) are flagged is_suppressed=true but carry a "
        "non-null encounters value -- suppression must never be represented as a literal number.",
    )

    (zero_but_suppressed,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_county_trends "
        "WHERE is_suppressed = true AND data_status != 'suppressed'",
    )
    report.add(
        "county_trends_suppressed_rows_labeled_suppressed",
        zero_but_suppressed == 0,
        f"{zero_but_suppressed} row(s) are is_suppressed=true but data_status is not "
        "'suppressed' -- the UI-facing label must match the underlying suppression flag.",
    )


def _audit_modeled_rows_carry_method_and_quality(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    (missing_method,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_tract_modeled "
        "WHERE method IS NULL OR method = '' "
        "OR crosswalk_quality IS NULL OR crosswalk_quality = ''",
    )
    report.add(
        "tract_modeled_rows_carry_method_and_quality",
        missing_method == 0,
        f"{missing_method} utilization_ed_tract_modeled row(s) are missing a method or "
        "crosswalk_quality label.",
    )

    (missing_method_2,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_access_vs_utilization "
        "WHERE modeled_ed_encounters_combined IS NOT NULL AND (method IS NULL OR method = '')",
    )
    report.add(
        "access_vs_utilization_modeled_rows_carry_method",
        missing_method_2 == 0,
        f"{missing_method_2} utilization_access_vs_utilization row(s) have a modeled encounter "
        "figure but no method label.",
    )


def _audit_allocation_conserves_observed_totals(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """The tract-level allocation must never manufacture more encounters
    than were actually observed at the ZIP level -- modeled total should
    be <= observed total, with the shortfall entirely explained by
    unmatched ZIPs (no crosswalk entry)."""
    (observed_total,) = _fetchone(
        conn, "SELECT COALESCE(SUM(encounters), 0) FROM analytics.utilization_ed_zip_observed"
    )
    (modeled_total,) = _fetchone(
        conn,
        "SELECT COALESCE(SUM(modeled_encounters), 0) FROM analytics.utilization_ed_tract_modeled",
    )
    report.add(
        "allocation_never_exceeds_observed_total",
        modeled_total <= observed_total + 0.01,
        f"Modeled total ({modeled_total:.1f}) exceeds observed total ({observed_total}) -- "
        "the crosswalk allocation must not manufacture encounters beyond what was observed.",
    )
    # A large gap (beyond a small unmatched-ZIP tail) would indicate a
    # join bug silently dropping most of the data rather than a few
    # genuinely un-crosswalked ZIPs.
    shortfall_fraction = 1 - (modeled_total / observed_total) if observed_total else 0
    report.add(
        "allocation_shortfall_within_expected_range",
        shortfall_fraction < 0.10,
        f"{shortfall_fraction:.1%} of observed encounters were not allocated to any tract "
        "(expected a small unmatched-ZIP tail, not a large systematic gap).",
    )


def _audit_no_negative_counts_or_rates(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    (neg_zip,) = _fetchone(
        conn, "SELECT COUNT(*) FROM analytics.utilization_ed_zip_observed WHERE encounters < 0"
    )
    (neg_tract,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_tract_modeled WHERE modeled_encounters < 0",
    )
    (neg_rate,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_access_vs_utilization "
        "WHERE modeled_ed_rate_per_1000 IS NOT NULL AND modeled_ed_rate_per_1000 < 0",
    )
    report.add(
        "no_negative_encounters_or_rates",
        neg_zip == 0 and neg_tract == 0 and neg_rate == 0,
        f"Negative values found: zip={neg_zip}, tract={neg_tract}, rate={neg_rate}.",
    )


def _audit_facility_totals_resolved(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    (n_facilities,) = _fetchone(
        conn, "SELECT COUNT(*) FROM analytics.utilization_ed_facility_summary"
    )
    report.add(
        "facility_summary_has_santa_clara_facilities",
        n_facilities > 0,
        f"{n_facilities} facilities in utilization_ed_facility_summary (expected > 0).",
    )

    (missing_total,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_facility_summary "
        "WHERE total_ed_encounters IS NULL",
    )
    report.add(
        "facility_summary_total_ed_encounters_resolved",
        missing_total == 0,
        f"{missing_total} facilities could not resolve a total_ed_encounters figure from any "
        "of the sex/payer/disposition breakdowns (all three were masked for the same facility).",
    )

    (missing_id,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_ed_facility_summary WHERE oshpd_id IS NULL",
    )
    report.add(
        "facility_summary_oshpd_id_present",
        missing_id == 0,
        f"{missing_id} facility_summary row(s) missing oshpd_id.",
    )


def _audit_criterion_validity_not_tautological(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    (n_rows,) = _fetchone(conn, "SELECT COUNT(*) FROM analytics.utilization_criterion_validity")
    report.add(
        "criterion_validity_present_for_every_scenario",
        n_rows > 0,
        f"{n_rows} utilization_criterion_validity row(s) present.",
    )

    (tautological_with_r,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_criterion_validity "
        "WHERE is_tautological = true AND spearman_r IS NOT NULL",
    )
    report.add(
        "criterion_validity_no_tautological_r_computed",
        tautological_with_r == 0,
        f"{tautological_with_r} row(s) flagged tautological but still have a computed "
        "spearman_r -- the tautology guard must block computation, not just flag it after.",
    )

    (missing_n,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_criterion_validity "
        "WHERE is_tautological = false AND n_paired_observations < 3 AND spearman_r IS NOT NULL",
    )
    report.add(
        "criterion_validity_requires_minimum_n",
        missing_n == 0,
        f"{missing_n} row(s) computed a correlation with fewer than 3 paired observations.",
    )


def _audit_implausible_rates_are_flagged(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """A ZIP-to-tract area-weighted rate above the plausibility ceiling
    (see run_utilization_pipeline.py's IMPLAUSIBLE_RATE_CEILING_PER_1000)
    must always carry rate_reliability='low_reliability' and an
    explanatory note -- never presented as an ordinary modeled value."""
    (unflagged,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_access_vs_utilization "
        "WHERE modeled_ed_rate_per_1000 > 1000 AND rate_reliability != 'low_reliability'",
    )
    report.add(
        "implausible_rates_flagged_low_reliability",
        unflagged == 0,
        f"{unflagged} tract(s) have a rate above the plausibility ceiling but are not flagged "
        "rate_reliability='low_reliability'.",
    )

    (missing_note,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_access_vs_utilization "
        "WHERE rate_reliability = 'low_reliability' "
        "AND (rate_reliability_note IS NULL OR rate_reliability_note = '')",
    )
    report.add(
        "low_reliability_rows_carry_explanatory_note",
        missing_note == 0,
        f"{missing_note} row(s) flagged low_reliability but missing an explanatory note.",
    )

    (missing_label,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM analytics.utilization_access_vs_utilization "
        "WHERE modeled_ed_rate_per_1000 IS NOT NULL AND rate_reliability IS NULL",
    )
    report.add(
        "every_computed_rate_has_a_reliability_label",
        missing_label == 0,
        f"{missing_label} row(s) have a computed rate but no rate_reliability label at all.",
    )


def _audit_observed_vs_modeled_labeled_on_every_row(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    checks = [
        ("utilization_ed_zip_observed", "observed"),
        ("utilization_ed_tract_modeled", "modeled"),
        ("utilization_ed_facility_summary", "observed"),
        ("utilization_access_vs_utilization", "modeled"),
    ]
    for table, expected_status in checks:
        (bad,) = _fetchone(
            conn,
            f"SELECT COUNT(*) FROM analytics.{table} "
            f"WHERE data_status IS NULL OR data_status != '{expected_status}'",
        )
        report.add(
            f"{table}_data_status_labeled_{expected_status}",
            bad == 0,
            f"{bad} row(s) in analytics.{table} do not carry data_status='{expected_status}'.",
        )
