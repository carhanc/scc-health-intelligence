"""Phase 6 orchestration: reads the already-loaded resources.* source
tables, canonicalizes and deduplicates them into resources.canonical_*
tables. Runs after run_core_sources_pipeline.py (which loads the raw
per-source tables this script reads) and before run_analytics_pipeline.py
(which will consume the canonical facility list for access metrics).
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb

from scc_health_pipeline.resources.canonicalize import (
    CanonicalFacility,
    CrosswalkEntry,
    DedupResult,
    DuplicateReviewEntry,
    RawResourceRecord,
    RejectedRecord,
    deduplicate_records,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"

# HCAI license categories treated as clinical-care candidate sites --
# matches the existing Phase 4 resource_accessibility candidate-site
# definition (pipelines/src/scc_health_pipeline/metrics/precomputed_geospatial.py)
# so the two stay consistent rather than silently diverging.
_HCAI_CLINICAL_CATEGORIES = [
    "General Acute Care Hospital",
    "Community Clinic",
    "Free Clinic",
    "Surgical Clinic",
    "Chronic Dialysis Clinic",
]

_HCAI_SOURCE_META = dict(
    is_official=True,
    source_publisher="California Dept. of Health Care Access and Information (HCAI)",
    source_dataset="resources.hcai_facilities",
    source_url="https://hcai.ca.gov/data/data-resources/healthcare-facility-attributes/",
    retrieved_at="see DATA_MANIFEST.json",
    source_vintage="rolling/continuous",
    license_or_terms="Creative Commons Attribution (CC-BY)",
)
_HRSA_SOURCE_META = dict(
    is_official=True,
    source_publisher="Health Resources and Services Administration (HRSA)",
    source_dataset="resources.hrsa_health_center_sites",
    source_url="https://data.hrsa.gov/data/download?titleFilter=Health+Center",
    retrieved_at="see DATA_MANIFEST.json",
    source_vintage="daily refresh",
    license_or_terms="Public domain (U.S. government work)",
)
_SCC_CLINICS_SOURCE_META = dict(
    is_official=False,
    source_publisher="Santa Clara County Public Health Department",
    source_dataset="resources.scc_health_clinics",
    source_url="https://data-sccphd.opendata.arcgis.com/datasets/sccphd::health-clinics",
    retrieved_at="see DATA_MANIFEST.json",
    source_vintage="rolling/continuous",
    license_or_terms="County of Santa Clara ArcGIS Hub open-data terms",
)
_SNAP_SOURCE_META = dict(
    is_official=True,
    source_publisher="USDA Food and Nutrition Administration (FNA)",
    source_dataset="resources.snap_retailers",
    source_url="https://www.fna.usda.gov/snap/retailer-locator/data",
    retrieved_at="see DATA_MANIFEST.json",
    source_vintage="Historical 2005-2025",
    license_or_terms="Public domain (U.S. government work)",
)
_TRANSIT_SOURCE_META = dict(
    is_official=True,
    source_publisher="Santa Clara Valley Transportation Authority (VTA)",
    source_dataset="resources.transit_stop_frequency_summary",
    source_url="https://www.vta.org/open-data-portal",
    retrieved_at="see DATA_MANIFEST.json",
    source_vintage="scheduled GTFS feed",
    license_or_terms="Open for developer use (VTA)",
)


def _load_hcai_clinical(conn: duckdb.DuckDBPyConnection) -> list[RawResourceRecord]:
    categories = "', '".join(_HCAI_CLINICAL_CATEGORIES)
    rows = conn.execute(
        f"""
        SELECT oshpd_id, facility_desc, license_category_desc, facility_status_desc,
               site_address1, site_city, site_zip, latitude, longitude
        FROM resources.hcai_facilities
        WHERE license_category_desc IN ('{categories}')
          AND facility_status_desc = 'Open'
        """
    ).fetchall()
    return [
        RawResourceRecord(
            source_id="hcai",
            source_specific_id=r[0],
            name=r[1] or "",
            category="hospital" if r[2] == "General Acute Care Hospital" else "clinic",
            subtype=r[2] or "",
            status=r[3] or "",
            address=r[4] or "",
            city=r[5] or "",
            zip_code=r[6] or "",
            latitude=r[7],
            longitude=r[8],
            **_HCAI_SOURCE_META,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _load_hrsa_health_centers(conn: duckdb.DuckDBPyConnection) -> list[RawResourceRecord]:
    # bphc_assigned_number is the per-SITE identifier -- health_center_number
    # is a grantee/organization-level number shared by many physical sites
    # (one HRSA grantee can operate dozens of locations), confirmed live:
    # 98 rows but only ~60 distinct health_center_number values, vs. 98
    # distinct bphc_assigned_number values (one per row). Using the wrong
    # field as source_specific_id produced duplicate canonical IDs.
    rows = conn.execute(
        """
        SELECT bphc_assigned_number, site_name, health_center_type, operating_status,
               site_address, site_city, site_zip, latitude, longitude
        FROM resources.hrsa_health_center_sites
        WHERE operating_status = 'Active'
        """
    ).fetchall()
    return [
        RawResourceRecord(
            source_id="hrsa",
            source_specific_id=r[0],
            name=r[1] or "",
            category="clinic",
            subtype=r[2] or "health_center",
            status=r[3] or "",
            address=r[4] or "",
            city=r[5] or "",
            zip_code=r[6] or "",
            latitude=r[7],
            longitude=r[8],
            **_HRSA_SOURCE_META,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _load_scc_health_clinics(conn: duckdb.DuckDBPyConnection) -> list[RawResourceRecord]:
    rows = conn.execute(
        """
        SELECT source_object_id, center_name, operated_by, matched_address, latitude, longitude
        FROM resources.scc_health_clinics
        """
    ).fetchall()
    return [
        RawResourceRecord(
            source_id="scc_health_clinics",
            source_specific_id=r[0],
            name=r[1] or "",
            category="clinic",
            subtype="community_clinic",
            status="",
            address=r[3] or "",
            city="",
            zip_code="",
            latitude=r[4],
            longitude=r[5],
            **_SCC_CLINICS_SOURCE_META,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _load_snap_retailers(conn: duckdb.DuckDBPyConnection) -> list[RawResourceRecord]:
    rows = conn.execute(
        """
        SELECT record_id, store_name, store_type, street_number, street_name, city,
               zip_code, latitude, longitude
        FROM resources.snap_retailers
        WHERE currently_authorized = true
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND NOT (latitude = 0 AND longitude = 0)
        """
    ).fetchall()
    return [
        RawResourceRecord(
            source_id="snap",
            source_specific_id=r[0],
            name=r[1] or "",
            category="food_retailer",
            subtype=r[2] or "",
            status="currently_authorized",
            address=f"{r[3] or ''} {r[4] or ''}".strip(),
            city=r[5] or "",
            zip_code=r[6] or "",
            latitude=r[7],
            longitude=r[8],
            **_SNAP_SOURCE_META,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _load_transit_hubs(conn: duckdb.DuckDBPyConnection) -> list[RawResourceRecord]:
    rows = conn.execute(
        """
        SELECT stop_id, stop_name, distinct_trips_serving_stop, stop_lat, stop_lon
        FROM resources.transit_stop_frequency_summary
        """
    ).fetchall()
    return [
        RawResourceRecord(
            source_id="vta_gtfs",
            source_specific_id=r[0],
            name=r[1] or "",
            category="transit_hub",
            subtype=f"{r[2]}_trips_scheduled",
            status="scheduled",
            address="",
            city="",
            zip_code="",
            latitude=r[3],
            longitude=r[4],
            **_TRANSIT_SOURCE_META,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _facilities_to_duckdb(
    conn: duckdb.DuckDBPyConnection, facilities: list[CanonicalFacility]
) -> None:
    conn.execute("CREATE SCHEMA IF NOT EXISTS resources")
    conn.execute("DROP TABLE IF EXISTS resources.canonical_facilities")
    conn.execute(
        """
        CREATE TABLE resources.canonical_facilities (
            canonical_resource_id VARCHAR PRIMARY KEY,
            category VARCHAR,
            subtype VARCHAR,
            name VARCHAR,
            normalized_name VARCHAR,
            status VARCHAR,
            address VARCHAR,
            city VARCHAR,
            zip_code VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            is_official BOOLEAN,
            dedup_status VARCHAR,
            coordinate_quality VARCHAR,
            n_contributing_sources INTEGER,
            limitation_notes VARCHAR
        )
        """
    )
    for f in facilities:
        conn.execute(
            "INSERT INTO resources.canonical_facilities VALUES "
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                f.canonical_resource_id, f.category, f.subtype, f.name, f.normalized_name,
                f.status, f.address, f.city, f.zip_code, f.latitude, f.longitude,
                f.is_official, f.dedup_status, f.coordinate_quality,
                f.n_contributing_sources, f.limitation_notes,
            ],
        )


def _crosswalk_to_duckdb(conn: duckdb.DuckDBPyConnection, crosswalk: list[CrosswalkEntry]) -> None:
    conn.execute("DROP TABLE IF EXISTS resources.facility_source_crosswalk")
    conn.execute(
        """
        CREATE TABLE resources.facility_source_crosswalk (
            canonical_resource_id VARCHAR,
            source_id VARCHAR,
            source_specific_id VARCHAR,
            match_method VARCHAR,
            match_confidence VARCHAR
        )
        """
    )
    for c in crosswalk:
        conn.execute(
            "INSERT INTO resources.facility_source_crosswalk VALUES (?, ?, ?, ?, ?)",
            [
                c.canonical_resource_id, c.source_id, c.source_specific_id,
                c.match_method, c.match_confidence,
            ],
        )


def _duplicate_review_to_duckdb(
    conn: duckdb.DuckDBPyConnection, entries: list[DuplicateReviewEntry]
) -> None:
    conn.execute("DROP TABLE IF EXISTS resources.facility_duplicate_review")
    conn.execute(
        """
        CREATE TABLE resources.facility_duplicate_review (
            record_a_source_id VARCHAR,
            record_a_source_specific_id VARCHAR,
            record_b_source_id VARCHAR,
            record_b_source_specific_id VARCHAR,
            distance_miles DOUBLE,
            name_similarity DOUBLE,
            decision VARCHAR,
            reason VARCHAR
        )
        """
    )
    for e in entries:
        conn.execute(
            "INSERT INTO resources.facility_duplicate_review VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                e.record_a_source_id, e.record_a_source_specific_id,
                e.record_b_source_id, e.record_b_source_specific_id,
                e.distance_miles, e.name_similarity, e.decision, e.reason,
            ],
        )


def _rejected_to_duckdb(conn: duckdb.DuckDBPyConnection, rejected: list[RejectedRecord]) -> None:
    conn.execute("DROP TABLE IF EXISTS resources.facility_rejected_records")
    conn.execute(
        """
        CREATE TABLE resources.facility_rejected_records (
            source_id VARCHAR,
            source_specific_id VARCHAR,
            reason VARCHAR
        )
        """
    )
    for r in rejected:
        conn.execute(
            "INSERT INTO resources.facility_rejected_records VALUES (?, ?, ?)",
            [r.source_id, r.source_specific_id, r.reason],
        )


def main() -> int:
    if not WAREHOUSE_PATH.exists():
        print(f"Warehouse not found at {WAREHOUSE_PATH}. Run `make data` first.")
        return 1

    conn = duckdb.connect(str(WAREHOUSE_PATH), read_only=False)
    try:
        clinical_records = (
            _load_hcai_clinical(conn)
            + _load_hrsa_health_centers(conn)
            + _load_scc_health_clinics(conn)
        )
        food_records = _load_snap_retailers(conn)
        transit_records = _load_transit_hubs(conn)

        print(f"Loaded {len(clinical_records)} raw clinical-care records "
              f"(HCAI + HRSA + SCC clinics), {len(food_records)} SNAP retailers, "
              f"{len(transit_records)} transit stops.")

        clinical_result = deduplicate_records(clinical_records)
        food_result = deduplicate_records(food_records)
        transit_result = deduplicate_records(transit_records)

        combined = DedupResult(
            canonical_facilities=(
                clinical_result.canonical_facilities
                + food_result.canonical_facilities
                + transit_result.canonical_facilities
            ),
            crosswalk=(
                clinical_result.crosswalk + food_result.crosswalk + transit_result.crosswalk
            ),
            duplicate_review=(
                clinical_result.duplicate_review
                + food_result.duplicate_review
                + transit_result.duplicate_review
            ),
            rejected=(
                clinical_result.rejected + food_result.rejected + transit_result.rejected
            ),
        )

        n_merged_groups = sum(
            1 for f in clinical_result.canonical_facilities if f.n_contributing_sources > 1
        )
        print(
            f"Clinical-care dedup: {len(clinical_records)} raw records -> "
            f"{len(clinical_result.canonical_facilities)} canonical facilities "
            f"({n_merged_groups} multi-source matches, "
            f"{len(clinical_result.rejected)} rejected)."
        )

        _facilities_to_duckdb(conn, combined.canonical_facilities)
        _crosswalk_to_duckdb(conn, combined.crosswalk)
        _duplicate_review_to_duckdb(conn, combined.duplicate_review)
        _rejected_to_duckdb(conn, combined.rejected)

        # Category coverage summary -- a small derived table, not a
        # separate audit-only artifact, since the Access Lab UI/API
        # reads it directly.
        conn.execute("DROP TABLE IF EXISTS resources.facility_category_coverage")
        conn.execute(
            """
            CREATE TABLE resources.facility_category_coverage AS
            SELECT category, subtype, COUNT(*) AS n_facilities,
                   SUM(CASE WHEN coordinate_quality = 'valid' THEN 1 ELSE 0 END)
                       AS n_valid_coordinates,
                   SUM(CASE WHEN is_official THEN 1 ELSE 0 END) AS n_official
            FROM resources.canonical_facilities
            GROUP BY category, subtype
            ORDER BY category, subtype
            """
        )
        coverage = conn.execute(
            "SELECT category, SUM(n_facilities) FROM resources.facility_category_coverage "
            "GROUP BY category ORDER BY category"
        ).fetchall()
        for category, count in coverage:
            print(f"  {category}: {count} canonical facilities")

        print("Resource canonicalization complete.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
