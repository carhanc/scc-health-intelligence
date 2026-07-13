"""Load curated geography tables into the DuckDB warehouse.

Creates the geo.* schema (docs/04_ARCHITECTURE_IMPLEMENTATION.md §6) plus
meta.sources / meta.builds provenance tables. Uses a single-writer
connection -- this runs only from `make data`, never from API request
handling (the API's connection is always read-only, see apps/api/.../db.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import duckdb

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS geo;

CREATE TABLE IF NOT EXISTS meta.sources (
    source_id VARCHAR PRIMARY KEY,
    status VARCHAR NOT NULL,
    row_count BIGINT,
    last_loaded_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS meta.builds (
    build_id VARCHAR PRIMARY KEY,
    started_at VARCHAR NOT NULL,
    finished_at VARCHAR,
    phase VARCHAR NOT NULL,
    notes VARCHAR
);
"""


@dataclass
class LoadSummary:
    table_row_counts: dict[str, int]
    build_id: str


def load_geography_tables(
    warehouse_path: Path,
    curated_paths: dict[str, Path],
    crosswalk_path: Path,
    unassigned_land_path: Path,
) -> LoadSummary:
    warehouse_path.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(warehouse_path), read_only=False)
    try:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")
        conn.execute(SCHEMA_SQL)

        row_counts: dict[str, int] = {}

        def load_geoparquet(table: str, path: Path) -> None:
            conn.execute(f"DROP TABLE IF EXISTS geo.{table}")
            conn.execute(
                f"CREATE TABLE geo.{table} AS SELECT * FROM read_parquet('{path.as_posix()}')"
            )
            count = conn.execute(f"SELECT COUNT(*) FROM geo.{table}").fetchone()
            row_counts[table] = int(count[0]) if count else 0

        load_geoparquet("tracts", curated_paths["tracts"])
        load_geoparquet("places", curated_paths["places"])
        load_geoparquet("zctas", curated_paths["zctas"])
        load_geoparquet("county", curated_paths["county"])
        load_geoparquet("supervisor_districts", curated_paths["supervisor_districts"])
        load_geoparquet(
            "tract_supervisor_district_assignment",
            curated_paths["tract_supervisor_district_assignment"],
        )
        load_geoparquet(
            "tract_place_assignment",
            curated_paths["tract_place_assignment"],
        )
        load_geoparquet("crosswalk_zip_tract", crosswalk_path)
        load_geoparquet("crosswalk_unassigned_tract_land", unassigned_land_path)

        now = datetime.now(UTC).isoformat()
        for source_id in [
            "tiger_tract_2020",
            "tiger_place_2020",
            "census_zcta_cartographic_2020",
            "census_county_cartographic_2020",
            "scc_supervisor_districts_2025",
            "census_zcta_tract_relationship_2020",
        ]:
            conn.execute(
                "INSERT OR REPLACE INTO meta.sources "
                "(source_id, status, row_count, last_loaded_at) "
                "VALUES (?, 'loaded', NULL, ?)",
                [source_id, now],
            )

        build_id = f"phase2-{now}"
        conn.execute(
            "INSERT OR REPLACE INTO meta.builds (build_id, started_at, finished_at, phase, notes) "
            "VALUES (?, ?, ?, ?, ?)",
            [build_id, now, now, "phase_2_geography_spine", "Geography spine load"],
        )

        return LoadSummary(table_row_counts=row_counts, build_id=build_id)
    finally:
        conn.close()
