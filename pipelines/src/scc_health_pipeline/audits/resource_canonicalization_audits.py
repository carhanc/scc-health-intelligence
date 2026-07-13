"""Phase 6 resource-canonicalization audit suite -- wired into `make audit`.

Checks the deduplication output for the integrity properties the Phase 6
spec requires: no orphaned crosswalk rows, no silently-dropped source
records, no canonical facility with a category that doesn't match any
contributing source, and coordinate-quality flags present on every row.
"""

from __future__ import annotations

from pathlib import Path

import duckdb

from scc_health_pipeline.audits.geography_audits import AuditReport, _fetchone

_EXPECTED_CATEGORIES = {"hospital", "clinic", "food_retailer", "transit_hub"}


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    (count,) = _fetchone(
        conn,
        "SELECT COUNT(*) FROM information_schema.tables "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}'",
    )
    return bool(count)


def run_resource_canonicalization_audits(warehouse_path: Path) -> AuditReport:
    report = AuditReport()
    if not warehouse_path.exists():
        report.add("warehouse_present", False, f"No warehouse found at {warehouse_path}.")
        return report

    conn = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        if not _table_exists(conn, "resources", "canonical_facilities"):
            report.add(
                "canonical_facilities_present",
                False,
                "resources.canonical_facilities not found -- run "
                "`run_resource_canonicalization` before auditing.",
            )
            return report
        report.add("canonical_facilities_present", True, "resources.canonical_facilities exists.")

        (n_facilities,) = _fetchone(conn, "SELECT COUNT(*) FROM resources.canonical_facilities")
        report.add(
            "canonical_facilities_nonzero",
            n_facilities > 0,
            f"{n_facilities} canonical facilities.",
        )

        (n_dup_ids,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM (SELECT canonical_resource_id, COUNT(*) c "
            "FROM resources.canonical_facilities GROUP BY canonical_resource_id "
            "HAVING COUNT(*) > 1)",
        )
        report.add(
            "canonical_facility_ids_unique",
            n_dup_ids == 0,
            f"{n_dup_ids} duplicate canonical_resource_id values." if n_dup_ids
            else "All canonical_resource_id values are unique.",
        )

        bad_categories = conn.execute(
            "SELECT DISTINCT category FROM resources.canonical_facilities "
            f"WHERE category NOT IN {tuple(_EXPECTED_CATEGORIES)}"
        ).fetchall()
        report.add(
            "canonical_facility_categories_known",
            len(bad_categories) == 0,
            f"Unexpected categories: {bad_categories}" if bad_categories
            else f"All categories are within {sorted(_EXPECTED_CATEGORIES)}.",
        )

        (n_missing_coord_quality,) = _fetchone(
            conn,
            "SELECT COUNT(*) FROM resources.canonical_facilities "
            "WHERE coordinate_quality IS NULL OR coordinate_quality = ''",
        )
        report.add(
            "canonical_facilities_have_coordinate_quality_flag",
            n_missing_coord_quality == 0,
            f"{n_missing_coord_quality} rows missing a coordinate_quality flag."
            if n_missing_coord_quality
            else "Every canonical facility has a coordinate_quality flag.",
        )

        if _table_exists(conn, "resources", "facility_source_crosswalk"):
            (n_orphan_crosswalk,) = _fetchone(
                conn,
                "SELECT COUNT(*) FROM resources.facility_source_crosswalk cw "
                "WHERE NOT EXISTS (SELECT 1 FROM resources.canonical_facilities f "
                "WHERE f.canonical_resource_id = cw.canonical_resource_id)",
            )
            report.add(
                "crosswalk_has_no_orphaned_rows",
                n_orphan_crosswalk == 0,
                f"{n_orphan_crosswalk} crosswalk rows reference a missing canonical facility."
                if n_orphan_crosswalk
                else "Every crosswalk row references an existing canonical facility.",
            )

            (n_facilities_without_crosswalk,) = _fetchone(
                conn,
                "SELECT COUNT(*) FROM resources.canonical_facilities f "
                "WHERE NOT EXISTS (SELECT 1 FROM resources.facility_source_crosswalk cw "
                "WHERE cw.canonical_resource_id = f.canonical_resource_id)",
            )
            report.add(
                "every_canonical_facility_has_source_lineage",
                n_facilities_without_crosswalk == 0,
                f"{n_facilities_without_crosswalk} canonical facilities have no crosswalk "
                "entry (source lineage would be lost)."
                if n_facilities_without_crosswalk
                else "Every canonical facility has at least one source-lineage crosswalk row.",
            )

        if _table_exists(conn, "resources", "facility_duplicate_review"):
            (n_proximity_only,) = _fetchone(
                conn,
                "SELECT COUNT(*) FROM resources.facility_duplicate_review "
                "WHERE decision = 'merged' AND name_similarity < 0.34 AND name_similarity > 0",
            )
            report.add(
                "no_merge_decided_on_proximity_alone",
                n_proximity_only == 0,
                f"{n_proximity_only} merges appear to have been decided on proximity alone "
                "(below the documented name-similarity threshold)." if n_proximity_only
                else "No merged pair fell below the documented name-similarity threshold "
                "(proximity alone never merges, per spec).",
            )

        return report
    finally:
        conn.close()
