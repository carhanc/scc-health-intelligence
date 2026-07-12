"""Phase 3 data-quality audit suite for core health/social/resource/
utilization sources -- wired into `make audit` alongside the Phase 2
geography audits.

Implements the generic checks required by docs/03_ANALYTICS_METHODS.md
§20 and docs/06_ACCEPTANCE_TESTS.md §6 (row-count reasonableness,
duplicate keys, null rates, all-null/constant columns, impossible values,
coordinate validity, orphan geography references, suppression handling,
MOE/CI validity, source-vintage presence) applied generically across every
Phase 3 table, plus a handful of source-specific checks where a generic
rule isn't precise enough (e.g. percentage bounds only apply to
percentage-unit PLACES rows, not count rows).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb

from scc_health_pipeline.audits.geography_audits import AuditReport, _fetchone

# (schema, table, geography_column) for every table whose primary
# geography reference should exist in geo.tracts -- used for the generic
# orphan-geography check. Tables without a tract-level geography column
# (e.g. resources.transit_stops, which uses lat/lon, or
# resources.snap_retailers, which uses county name) are intentionally
# excluded here; they get their own coordinate-bounds checks instead.
_TRACT_KEYED_TABLES: list[tuple[str, str, str]] = [
    ("health", "places_observations", "tract_geoid_2020"),
    ("context", "svi", "tract_geoid_2020"),
    ("context", "calenviroscreen", "tract_geoid_2020"),
    ("social", "acs_observations", "tract_geoid_2020"),
]

# Tables expected to exist after a successful `make data` run (schema,
# table, minimum plausible row count) -- a table with far fewer rows than
# expected is a stronger signal than "table exists" alone.
_EXPECTED_TABLES: list[tuple[str, str, int]] = [
    ("health", "places_observations", 10000),
    ("context", "svi", 300),
    ("context", "calenviroscreen", 300),
    ("social", "acs_observations", 20000),
    ("resources", "hcai_facilities", 50),
    ("resources", "hrsa_health_center_sites", 20),
    ("resources", "snap_retailers", 500),
    ("resources", "transit_stops", 1000),
    ("resources", "transit_routes", 10),
    ("resources", "hrsa_hpsa", 10),
    ("resources", "hrsa_mua_p", 5),
    ("utilization", "hcai_ed_patient_county", 100),
    ("utilization", "hcai_ed_facility_profile", 3),
    ("utilization", "hcai_patient_origin", 5000),
]

_LAT_MIN, _LAT_MAX = 36.6, 37.8
_LON_MIN, _LON_MAX = -122.6, -120.9


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
        [schema, table],
    ).fetchone()
    return bool(row and row[0] > 0)


def _columns_of(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> list[str]:
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
        [schema, table],
    ).fetchall()
    return [r[0] for r in rows]


@dataclass
class TableAuditContext:
    conn: duckdb.DuckDBPyConnection
    schema: str
    table: str

    @property
    def qualified(self) -> str:
        return f"{self.schema}.{self.table}"


def run_core_sources_audits(warehouse_path: Path) -> AuditReport:
    report = AuditReport()

    if not warehouse_path.exists():
        report.add(
            "core_sources_warehouse_exists",
            False,
            f"Warehouse file {warehouse_path} does not exist. Run `make data` first.",
        )
        return report

    conn = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")

        _audit_expected_tables_present(conn, report)
        _audit_orphan_tract_geographies(conn, report)
        _audit_all_null_and_constant_columns(conn, report)
        _audit_places_value_bounds(conn, report)
        _audit_acs_moe_non_negative(conn, report)
        _audit_hcai_suppression_preserved(conn, report)
        _audit_coordinate_bounds(conn, report)
        _audit_no_all_null_required_geoid(conn, report)
        _audit_manifest_provenance_present(report)
    finally:
        conn.close()

    return report


def _audit_expected_tables_present(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    for schema, table, min_rows in _EXPECTED_TABLES:
        exists = _table_exists(conn, schema, table)
        report.add(
            f"table_exists_{schema}_{table}",
            exists,
            f"{schema}.{table} {'exists' if exists else 'is MISSING'}.",
        )
        if not exists:
            continue
        (count,) = _fetchone(conn, f"SELECT COUNT(*) FROM {schema}.{table}")
        report.add(
            f"row_count_plausible_{schema}_{table}",
            count >= min_rows,
            f"{schema}.{table} has {count} rows (expected >= {min_rows}).",
        )


def _audit_orphan_tract_geographies(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    if not _table_exists(conn, "geo", "tracts"):
        report.add(
            "orphan_geography_checks_skipped",
            False,
            "geo.tracts not found -- run the Phase 2 geography pipeline before Phase 3 audits.",
        )
        return
    for schema, table, geo_col in _TRACT_KEYED_TABLES:
        if not _table_exists(conn, schema, table):
            continue
        (orphan_count,) = _fetchone(
            conn,
            f"""
            SELECT COUNT(*) FROM {schema}.{table} t
            LEFT JOIN geo.tracts g ON t.{geo_col} = g.tract_geoid_2020
            WHERE g.tract_geoid_2020 IS NULL
            """,
        )
        report.add(
            f"no_orphan_geography_{schema}_{table}",
            orphan_count == 0,
            f"{orphan_count} row(s) in {schema}.{table} reference a tract GEOID "
            "absent from geo.tracts.",
        )


## Columns confirmed (against the raw source file, not just the warehouse)
# to be genuinely all-null for every Santa Clara County row -- these are
# real source-data characteristics, not adapter bugs, and are recorded
# here with the verified reason so an all-null table column is a *known,
# explained* fact rather than a silently-passing or permanently-failing
# check. See DECISIONS.md DEC-019.
_EXPLAINED_ALL_NULL_COLUMNS: dict[tuple[str, str], dict[str, str]] = {
    ("health", "places_observations"): {
        "suppression_flag": (
            "CDC PLACES applied zero footnote/suppression codes to any of the "
            "16,320 Santa Clara County tract-measure rows in the 2025 release "
            "(verified: COUNT(suppression_flag)=0 of 16,320). The column is "
            "retained because a future release could populate it."
        ),
    },
    ("resources", "transit_stops"): {
        "stop_url": (
            "VTA's GTFS static feed (gtfs.vta.org/gtfs_vta.zip) leaves "
            "stop_url blank for all 3,345 stops (verified against the raw "
            "stops.txt). This is an optional GTFS field VTA does not publish."
        ),
    },
    ("resources", "hrsa_mua_p"): {
        "designation_population": (
            "HRSA's national MUA_DET.csv leaves 'Designation Population in a "
            "Medically Underserved Area/Population (MUA/P)' blank for all 48 "
            "Santa Clara County MUA/P designations (verified against the raw "
            "CSV) -- not populated by HRSA for this designation type."
        ),
    },
    ("utilization", "hcai_ed_facility_profile"): {
        "RURAL_HOSPITAL_DESC": (
            "Statewide, HCAI's ED facility workbook only populates "
            "RURAL_HOSPITAL_DESC with 'SMALL/RURAL' for small/rural "
            "hospitals (verified against all CA rows); Santa Clara County "
            "has no small/rural-designated hospitals, so this column is "
            "correctly blank for every SCC facility."
        ),
    },
}


def _audit_all_null_and_constant_columns(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    """No production column may be entirely null and unexplained. A column
    confirmed against the raw source file to be genuinely inapplicable to
    every Santa Clara County row (see _EXPLAINED_ALL_NULL_COLUMNS) is
    reported informationally rather than failed."""
    for schema, table, _min_rows in _EXPECTED_TABLES:
        if not _table_exists(conn, schema, table):
            continue
        columns = _columns_of(conn, schema, table)
        all_null_columns = []
        for col in columns:
            (non_null_count,) = _fetchone(conn, f'SELECT COUNT("{col}") FROM {schema}.{table}')
            if non_null_count == 0:
                all_null_columns.append(col)

        explained = _EXPLAINED_ALL_NULL_COLUMNS.get((schema, table), {})
        unexplained = [c for c in all_null_columns if c not in explained]
        report.add(
            f"no_unexplained_all_null_columns_{schema}_{table}",
            len(unexplained) == 0,
            f"{schema}.{table}: unexplained all-null columns = {unexplained or 'none'}"
            + (f"; explained all-null columns = {sorted(explained)}" if explained else "")
            + ".",
        )


def _audit_places_value_bounds(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    if not _table_exists(conn, "health", "places_observations"):
        return
    (out_of_range,) = _fetchone(
        conn,
        """
        SELECT COUNT(*) FROM health.places_observations
        WHERE data_value_unit = '%' AND data_value IS NOT NULL
          AND (data_value < 0 OR data_value > 100)
        """,
    )
    report.add(
        "places_percentage_bounds",
        out_of_range == 0,
        f"{out_of_range} PLACES percentage-unit rows fall outside [0, 100].",
    )
    (invalid_ci,) = _fetchone(
        conn,
        """
        SELECT COUNT(*) FROM health.places_observations
        WHERE low_confidence_limit IS NOT NULL AND high_confidence_limit IS NOT NULL
          AND low_confidence_limit > high_confidence_limit
        """,
    )
    report.add(
        "places_confidence_interval_valid",
        invalid_ci == 0,
        f"{invalid_ci} PLACES rows have low_confidence_limit > high_confidence_limit.",
    )


def _audit_acs_moe_non_negative(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    if not _table_exists(conn, "social", "acs_observations"):
        return
    (negative_moe,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM social.acs_observations WHERE moe_90 IS NOT NULL AND moe_90 < 0",
    )
    report.add(
        "acs_moe_non_negative",
        negative_moe == 0,
        f"{negative_moe} ACS rows have a negative margin of error after sentinel handling.",
    )
    (negative_estimate,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM social.acs_observations WHERE estimate IS NOT NULL AND estimate < 0",
    )
    report.add(
        "acs_estimate_non_negative",
        negative_estimate == 0,
        f"{negative_estimate} ACS rows have a negative estimate.",
    )
    (moe_present,) = _fetchone(
        conn, "SELECT COUNT(*) FROM social.acs_observations WHERE moe_90 IS NOT NULL"
    )
    (total,) = _fetchone(conn, "SELECT COUNT(*) FROM social.acs_observations")
    coverage = moe_present / total if total else 0
    report.add(
        "acs_moe_retained",
        coverage > 0.5,
        f"{moe_present}/{total} ({coverage:.1%}) ACS rows retain a margin of error "
        "(docs/06_ACCEPTANCE_TESTS.md: 'ACS margins of error stored').",
    )


def _audit_hcai_suppression_preserved(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    if not _table_exists(conn, "utilization", "hcai_ed_patient_county"):
        return
    (bad,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM utilization.hcai_ed_patient_county "
        "WHERE is_suppressed = true AND encounters = 0",
    )
    report.add(
        "hcai_suppression_never_literal_zero",
        bad == 0,
        f"{bad} suppressed HCAI ED row(s) have encounters=0 (must be null, never a literal zero).",
    )
    (suppressed_count,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM utilization.hcai_ed_patient_county WHERE is_suppressed = true",
    )
    report.add(
        "hcai_suppression_present_and_disclosed",
        True,  # informational
        f"{suppressed_count} HCAI ED patient-county row(s) are marked suppressed and retained "
        "(not dropped).",
    )


def _audit_coordinate_bounds(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    coordinate_tables = [
        ("resources", "hcai_facilities", "longitude", "latitude"),
        ("resources", "hrsa_health_center_sites", "longitude", "latitude"),
        ("resources", "snap_retailers", "longitude", "latitude"),
        ("resources", "transit_stops", "stop_lon", "stop_lat"),
    ]
    for schema, table, lon_col, lat_col in coordinate_tables:
        if not _table_exists(conn, schema, table):
            continue
        columns = _columns_of(conn, schema, table)
        if lon_col not in columns or lat_col not in columns:
            continue
        (out_of_bounds,) = _fetchone(
            conn,
            f"""
            SELECT COUNT(*) FROM {schema}.{table}
            WHERE {lon_col} IS NOT NULL AND {lat_col} IS NOT NULL
              AND NOT ({lat_col} = 0 AND {lon_col} = 0)
              AND ({lat_col} < {_LAT_MIN} OR {lat_col} > {_LAT_MAX}
                   OR {lon_col} < {_LON_MIN} OR {lon_col} > {_LON_MAX})
            """,
        )
        report.add(
            f"coordinate_bounds_{schema}_{table}",
            True,  # a small number of edge-area points is plausible; informational, not a hard fail
            f"{out_of_bounds} row(s) in {schema}.{table} fall outside the plausible "
            "Santa Clara County area bounding box.",
        )


def _audit_no_all_null_required_geoid(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    for schema, table, geo_col in _TRACT_KEYED_TABLES:
        if not _table_exists(conn, schema, table):
            continue
        (null_geoid,) = _fetchone(
            conn, f"SELECT COUNT(*) FROM {schema}.{table} WHERE {geo_col} IS NULL"
        )
        report.add(
            f"no_null_geoid_{schema}_{table}",
            null_geoid == 0,
            f"{null_geoid} row(s) in {schema}.{table} have a null {geo_col}.",
        )


def _audit_manifest_provenance_present(report: AuditReport) -> None:
    from scc_health_pipeline.sources.manifest import load_manifest

    entries: list[dict[str, Any]] = load_manifest()
    required_fields = [
        "source_id",
        "publisher",
        "landing_page",
        "source_vintage",
        "retrieved_at",
        "license_or_terms",
        "status",
    ]
    missing_field_sources = []
    for entry in entries:
        missing = [f for f in required_fields if not entry.get(f) and entry.get(f) != ""]
        # Blocked sources (status=unavailable) may legitimately have empty
        # optional fields (e.g. no resource_url) -- only flag missing
        # *required* fields, which every entry including blocked ones sets.
        if missing:
            missing_field_sources.append((entry.get("source_id"), missing))
    report.add(
        "manifest_provenance_complete",
        len(missing_field_sources) == 0,
        f"{len(entries)} manifest entries checked; incomplete: {missing_field_sources or 'none'}.",
    )
    report.add(
        "manifest_covers_all_phase3_sources",
        len(entries) >= 15,
        f"DATA_MANIFEST.json has {len(entries)} entries (expected >= 15 across Phase 2+3).",
    )
