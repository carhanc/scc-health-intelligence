"""Build a deterministic offline demo warehouse from the checked-in
data/demo/geography/ snapshot -- no network access required.

Writes to a SEPARATE warehouse file (scc_health_demo.duckdb) from the live
warehouse (scc_health.duckdb), so running `make demo` never overwrites or
corrupts a live `make data` build. Wired into `make demo`.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_demo_pipeline
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import duckdb

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_GEOGRAPHY_DIR = REPO_ROOT / "data" / "demo" / "geography"
DEMO_WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health_demo.duckdb"

_SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS geo;

CREATE TABLE IF NOT EXISTS meta.builds (
    build_id VARCHAR PRIMARY KEY,
    started_at VARCHAR NOT NULL,
    finished_at VARCHAR,
    phase VARCHAR NOT NULL,
    notes VARCHAR
);
"""

_TABLE_FILES = {
    "tracts": "tracts.parquet",
    "places": "places.parquet",
    "zctas": "zctas.parquet",
    "county": "county.parquet",
    "supervisor_districts": "supervisor_districts.parquet",
    "tract_supervisor_district_assignment": "tract_supervisor_district_assignment.parquet",
    "tract_place_assignment": "tract_place_assignment.parquet",
    "crosswalk_zip_tract": "zcta_tract_crosswalk.parquet",
    "crosswalk_unassigned_tract_land": "unassigned_tract_land.parquet",
}


def main() -> int:
    missing = [f for f in _TABLE_FILES.values() if not (DEMO_GEOGRAPHY_DIR / f).exists()]
    if missing:
        print(f"Demo snapshot files missing: {missing}")
        print(
            "Run `python scripts/build_demo_geography_snapshot.py` after a live "
            "`make data` run at least once to generate the checked-in snapshot."
        )
        return 1

    DEMO_WAREHOUSE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(DEMO_WAREHOUSE_PATH), read_only=False)
    try:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")
        conn.execute(_SCHEMA_SQL)

        for table, filename in _TABLE_FILES.items():
            path = DEMO_GEOGRAPHY_DIR / filename
            conn.execute(f"DROP TABLE IF EXISTS geo.{table}")
            conn.execute(
                f"CREATE TABLE geo.{table} AS SELECT * FROM read_parquet('{path.as_posix()}')"
            )
            count = conn.execute(f"SELECT COUNT(*) FROM geo.{table}").fetchone()
            print(f"  geo.{table}: {count[0] if count else 0} rows (demo snapshot)")

        now = datetime.now(UTC).isoformat()
        build_id = f"demo-{now}"
        conn.execute(
            "INSERT OR REPLACE INTO meta.builds (build_id, started_at, finished_at, phase, notes) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                build_id,
                now,
                now,
                "demo_geography",
                "Built from data/demo/geography/ checked-in snapshot, no network access.",
            ],
        )
        print(f"  build_id={build_id}")
    finally:
        conn.close()

    print(f"\nDemo warehouse built at {DEMO_WAREHOUSE_PATH} (offline, no live sources fetched).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
