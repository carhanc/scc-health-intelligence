#!/usr/bin/env python3
"""Build DATA_MANIFEST.production.json from the live warehouse (Phase 9).

Introspects `warehouse/scc_health.duckdb` directly (the same read-only
connection pattern the API uses, `apps/api/src/scc_health_api/db.py`) and
writes a machine-readable manifest recording: build timestamp, a stable
build_id, every table's row count, a SHA-256 of the warehouse file
itself, source vintages/publishers (from the existing `DATA_MANIFEST.json`
provenance the ingestion pipelines already produce), and any sources
`RISK_REGISTER.md` records as missing an offline snapshot.

Fails loudly (non-zero exit) if the warehouse is missing, unreadable, or
an expected schema/table from `DATA_DICTIONARY.md` is absent -- this
script must never write a manifest describing a partial or broken
warehouse as if it were complete (CLAUDE.md: "never silently substitute
fake data" applies equally to silently describing bad data as good).

Usage:
    uv run python scripts/build_production_manifest.py
    uv run python scripts/build_production_manifest.py --warehouse path/to/other.duckdb
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import duckdb

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WAREHOUSE = REPO_ROOT / "warehouse" / "scc_health.duckdb"
DATA_MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"
OUTPUT_PATH = REPO_ROOT / "DATA_MANIFEST.production.json"

# Every schema this warehouse must contain for a production release to be
# considered complete -- one entry per DATA_DICTIONARY.md section. A
# missing schema here means a phase's tables never got built, not a
# cosmetic gap; the script refuses to publish a manifest in that case.
REQUIRED_SCHEMAS = [
    "geo",
    "health",
    "social",
    "context",
    "analytics",
    "resources",
    "utilization",
    "meta",
]

# Known, disclosed gaps (RISK_REGISTER.md RISK-019/RISK-029): these
# schemas/tables exist only in a live build, with no separate offline
# demo snapshot. Recorded here so the manifest is explicit about it
# rather than silent.
KNOWN_MISSING_OFFLINE_SNAPSHOTS = [
    "analytics.* (RISK-019): no frozen offline demo snapshot; requires a live `make data` build.",
    "analytics.utilization_* (RISK-029): same gap, Phase 7 tables.",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_source_provenance() -> list[dict]:
    if not DATA_MANIFEST_PATH.exists():
        return []
    with DATA_MANIFEST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def introspect_tables(conn: duckdb.DuckDBPyConnection) -> dict[str, dict[str, int]]:
    rows = conn.execute(
        "SELECT table_schema, table_name FROM information_schema.tables "
        "WHERE table_schema NOT IN ('information_schema', 'pg_catalog') "
        "ORDER BY table_schema, table_name"
    ).fetchall()
    tables_by_schema: dict[str, dict[str, int]] = {}
    for schema, name in rows:
        count = conn.execute(f"SELECT COUNT(*) FROM {schema}.{name}").fetchone()[0]  # noqa: S608 -- identifiers from information_schema, not user input
        tables_by_schema.setdefault(schema, {})[name] = count
    return tables_by_schema


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--warehouse", type=Path, default=DEFAULT_WAREHOUSE)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    warehouse_path: Path = args.warehouse
    if not warehouse_path.exists():
        print(
            f"ERROR: warehouse not found at {warehouse_path}. Run `make data` first.",
            file=sys.stderr,
        )
        return 1

    try:
        conn = duckdb.connect(str(warehouse_path), read_only=True)
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")
    except duckdb.Error as exc:
        print(f"ERROR: could not connect to warehouse: {exc}", file=sys.stderr)
        return 1

    try:
        tables_by_schema = introspect_tables(conn)
    finally:
        conn.close()

    missing_schemas = [s for s in REQUIRED_SCHEMAS if s not in tables_by_schema]
    if missing_schemas:
        print(
            "ERROR: warehouse is missing required schema(s), refusing to publish a manifest: "
            f"{missing_schemas}. This warehouse is not a complete production build.",
            file=sys.stderr,
        )
        return 1

    total_rows = sum(sum(counts.values()) for counts in tables_by_schema.values())
    if total_rows == 0:
        print(
            "ERROR: warehouse has zero total rows across all tables. Refusing to publish.",
            file=sys.stderr,
        )
        return 1

    now = datetime.now(UTC)
    build_id = f"prod-{now.strftime('%Y%m%dT%H%M%SZ')}"
    source_provenance = load_source_provenance()

    manifest = {
        "build_id": build_id,
        "built_at": now.isoformat(),
        "warehouse_path": str(warehouse_path),
        "warehouse_sha256": sha256_file(warehouse_path),
        "warehouse_bytes": warehouse_path.stat().st_size,
        "schemas": {
            schema: {"table_count": len(tables), "tables": tables}
            for schema, tables in sorted(tables_by_schema.items())
        },
        "total_tables": sum(len(t) for t in tables_by_schema.values()),
        "total_rows": total_rows,
        "source_vintages": [
            {
                "source_id": s["source_id"],
                "publisher": s["publisher"],
                "source_vintage": s["source_vintage"],
                "retrieved_at": s["retrieved_at"],
                "license_or_terms": s.get("license_or_terms"),
            }
            for s in source_provenance
        ],
        "known_missing_offline_snapshots": KNOWN_MISSING_OFFLINE_SNAPSHOTS,
    }

    args.output.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.output} -- build_id={build_id}, "
        f"{manifest['total_tables']} tables, {total_rows:,} total rows."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
