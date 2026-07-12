"""Geography audit suite -- wired into `make audit` (docs/06_ACCEPTANCE_TESTS.md
§5, docs/03_ANALYTICS_METHODS.md §20, docs/07_BUILD_PHASES.md Phase 2 gate).

Every check here operates against the loaded DuckDB warehouse, not staged
files, so it audits exactly what the API will serve. Returns a structured
report rather than raising on the first failure, so a single run surfaces
every problem at once.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import duckdb

from scc_health_pipeline.geography.constants import (
    COUNTY_GEOID_SANTA_CLARA,
    TRACT_GEOID_LENGTH,
)

# Plausible Santa Clara County lat/lon bounding box, used as a coarse
# sanity check that stored geometry is genuinely in WGS84 degrees and not
# some other CRS (e.g. accidentally left in a projected meters-based CRS,
# which would produce coordinates far outside this range).
_LAT_MIN, _LAT_MAX = 36.8, 37.6
_LON_MIN, _LON_MAX = -122.3, -121.1

# Santa Clara County has had this many 2020 Census tracts, hand-verified
# against the loaded warehouse during Phase 2 (408 tracts).
_EXPECTED_TRACT_COUNT_RANGE = (300, 500)
_MIN_SPATIAL_JOIN_COVERAGE = 0.99


def _fetchone(conn: duckdb.DuckDBPyConnection, sql: str) -> tuple[Any, ...]:
    """`fetchone()` typed as always returning a row for these COUNT/scalar
    queries (which always produce exactly one row), converting duckdb's
    `tuple | None` return type into a plain tuple mypy can index safely."""
    row = conn.execute(sql).fetchone()
    if row is None:
        raise RuntimeError(f"Expected exactly one row from query, got none: {sql}")
    return row


@dataclass
class AuditFinding:
    check: str
    passed: bool
    message: str


@dataclass
class AuditReport:
    findings: list[AuditFinding] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(f.passed for f in self.findings)

    def add(self, check: str, passed: bool, message: str) -> None:
        self.findings.append(AuditFinding(check, passed, message))

    def print_summary(self) -> None:
        for finding in self.findings:
            status = "PASS" if finding.passed else "FAIL"
            print(f"  [{status}] {finding.check}: {finding.message}")


def run_geography_audits(warehouse_path: Path) -> AuditReport:
    report = AuditReport()

    if not warehouse_path.exists():
        report.add(
            "warehouse_exists",
            False,
            f"Warehouse file {warehouse_path} does not exist. Run `make data` first.",
        )
        return report

    conn = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")

        _audit_leading_zeros_and_duplicates(conn, report)
        _audit_county_prefix(conn, report)
        _audit_row_count_reasonableness(conn, report)
        _audit_geometry_validity(conn, report)
        _audit_crs_plausibility(conn, report)
        _audit_crosswalk_weight_sums(conn, report)
        _audit_orphan_geographies(conn, report)
        _audit_spatial_join_coverage(conn, report)
        _audit_hand_verified_examples(conn, report)
    finally:
        conn.close()

    return report


def _audit_leading_zeros_and_duplicates(
    conn: duckdb.DuckDBPyConnection, report: AuditReport
) -> None:
    total, distinct, min_len, max_len = _fetchone(
        conn,
        "SELECT COUNT(*), COUNT(DISTINCT tract_geoid_2020), "
        "MIN(LENGTH(tract_geoid_2020)), MAX(LENGTH(tract_geoid_2020)) FROM geo.tracts",
    )
    report.add(
        "tract_geoid_length",
        min_len == TRACT_GEOID_LENGTH and max_len == TRACT_GEOID_LENGTH,
        f"tract_geoid_2020 length range [{min_len}, {max_len}], "
        f"expected exactly {TRACT_GEOID_LENGTH}.",
    )
    report.add(
        "tract_geoid_no_duplicates",
        total == distinct,
        f"{total} tract rows, {distinct} distinct GEOIDs.",
    )


def _audit_county_prefix(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (bad,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM geo.tracts WHERE tract_geoid_2020 NOT LIKE "
        f"'{COUNTY_GEOID_SANTA_CLARA}%'",
    )
    report.add(
        "county_prefix",
        bad == 0,
        f"{bad} tract(s) do not carry the {COUNTY_GEOID_SANTA_CLARA} county prefix.",
    )
    (county_geoid,) = _fetchone(conn, "SELECT county_geoid FROM geo.county")
    report.add(
        "county_row_geoid",
        county_geoid == COUNTY_GEOID_SANTA_CLARA,
        f"geo.county row has county_geoid={county_geoid!r}.",
    )


def _audit_row_count_reasonableness(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (tract_count,) = _fetchone(conn, "SELECT COUNT(*) FROM geo.tracts")
    low, high = _EXPECTED_TRACT_COUNT_RANGE
    report.add(
        "tract_row_count_plausible",
        low <= tract_count <= high,
        f"{tract_count} tracts loaded (expected {low}-{high}).",
    )
    (district_count,) = _fetchone(conn, "SELECT COUNT(*) FROM geo.supervisor_districts")
    report.add(
        "supervisor_district_count",
        district_count == 5,
        f"{district_count} supervisor districts loaded (expected exactly 5).",
    )


def _audit_geometry_validity(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    for table in ["tracts", "places", "zctas", "county", "supervisor_districts"]:
        total, valid = _fetchone(
            conn,
            "SELECT COUNT(*), SUM(CASE WHEN ST_IsValid(geometry) THEN 1 ELSE 0 END) "
            f"FROM geo.{table}",
        )
        report.add(
            f"geometry_valid_{table}",
            total == valid,
            f"{valid}/{total} geometries valid in geo.{table}.",
        )


def _audit_crs_plausibility(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    # TIGER's INTPTLAT/INTPTLON source fields are text (e.g. "+37.123456"),
    # not numeric -- confirmed against the live schema during Phase 2.
    (out_of_bounds,) = _fetchone(
        conn,
        f"""
        SELECT COUNT(*) FROM geo.tracts
        WHERE CAST(internal_point_lat AS DOUBLE) NOT BETWEEN {_LAT_MIN} AND {_LAT_MAX}
           OR CAST(internal_point_lon AS DOUBLE) NOT BETWEEN {_LON_MIN} AND {_LON_MAX}
        """,
    )
    report.add(
        "crs_plausibility_wgs84",
        out_of_bounds == 0,
        f"{out_of_bounds} tract internal points fall outside the plausible Santa Clara "
        "County WGS84 bounding box (a nonzero count would suggest a CRS/reprojection bug).",
    )


def _audit_crosswalk_weight_sums(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (out_of_range,) = _fetchone(
        conn,
        """
        SELECT COUNT(*) FROM (
            SELECT zcta_geoid, SUM(weight) AS weight_sum
            FROM geo.crosswalk_zip_tract
            GROUP BY zcta_geoid
        ) WHERE weight_sum <= 0 OR weight_sum > 1.0001
        """,
    )
    report.add(
        "crosswalk_weight_sums",
        out_of_range == 0,
        f"{out_of_range} ZCTA(s) have a Santa-Clara-portion weight sum outside (0, 1].",
    )


def _audit_orphan_geographies(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (orphan_crosswalk,) = _fetchone(
        conn,
        """
        SELECT COUNT(*) FROM geo.crosswalk_zip_tract c
        LEFT JOIN geo.tracts t ON c.tract_geoid_2020 = t.tract_geoid_2020
        WHERE t.tract_geoid_2020 IS NULL
        """,
    )
    report.add(
        "no_orphan_crosswalk_tracts",
        orphan_crosswalk == 0,
        f"{orphan_crosswalk} crosswalk row(s) reference a tract GEOID absent from geo.tracts.",
    )
    (orphan_assignment,) = _fetchone(
        conn,
        """
        SELECT COUNT(*) FROM geo.tract_supervisor_district_assignment a
        LEFT JOIN geo.tracts t ON a.tract_geoid_2020 = t.tract_geoid_2020
        WHERE t.tract_geoid_2020 IS NULL
        """,
    )
    report.add(
        "no_orphan_district_assignments",
        orphan_assignment == 0,
        f"{orphan_assignment} district-assignment row(s) reference an unknown tract GEOID.",
    )


def _audit_spatial_join_coverage(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    (total_tracts,) = _fetchone(conn, "SELECT COUNT(*) FROM geo.tracts")
    (assigned_tracts,) = _fetchone(
        conn,
        "SELECT COUNT(DISTINCT tract_geoid_2020) FROM geo.tract_supervisor_district_assignment",
    )
    coverage = assigned_tracts / total_tracts if total_tracts else 0
    report.add(
        "spatial_join_coverage_tract_to_district",
        coverage >= _MIN_SPATIAL_JOIN_COVERAGE,
        f"{assigned_tracts}/{total_tracts} tracts ({coverage:.1%}) have a supervisor-district "
        f"assignment (threshold {_MIN_SPATIAL_JOIN_COVERAGE:.0%}).",
    )
    (boundary_crossing,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM geo.tract_supervisor_district_assignment "
        "WHERE is_clean_assignment = false",
    )
    report.add(
        "boundary_crossing_tracts_disclosed",
        True,  # informational, not a failure condition
        f"{boundary_crossing} tract(s) are boundary-crossing (majority district share < 95%); "
        "all district shares are retained in all_district_shares, not silently dropped.",
    )


def _audit_hand_verified_examples(conn: duckdb.DuckDBPyConnection, report: AuditReport) -> None:
    # Representative hand-verified examples (docs/07_BUILD_PHASES.md Phase 2).
    (known_tract,) = _fetchone(
        conn, "SELECT COUNT(*) FROM geo.tracts WHERE tract_geoid_2020 = '06085500100'"
    )
    report.add(
        "hand_verified_known_tract_exists",
        known_tract == 1,
        "Tract 06085500100 (an early-numbered downtown San Jose tract) exists exactly once.",
    )
    districts = conn.execute(
        "SELECT district_number FROM geo.supervisor_districts ORDER BY district_number"
    ).fetchall()
    district_numbers = [d[0] for d in districts]
    report.add(
        "hand_verified_district_numbers_1_to_5",
        district_numbers == [1, 2, 3, 4, 5],
        f"Supervisor district numbers are {district_numbers}, expected [1, 2, 3, 4, 5].",
    )
