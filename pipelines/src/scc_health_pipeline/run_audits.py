"""CLI entrypoint for `make audit`'s geography checks.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_audits
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from scc_health_pipeline.audits.access_metrics_audits import run_access_metrics_audits
from scc_health_pipeline.audits.analytics_audits import run_analytics_audits
from scc_health_pipeline.audits.core_sources_audits import run_core_sources_audits
from scc_health_pipeline.audits.geography_audits import AuditReport, run_geography_audits
from scc_health_pipeline.audits.network_graph_audits import run_network_graph_audits
from scc_health_pipeline.audits.resource_canonicalization_audits import (
    run_resource_canonicalization_audits,
)
from scc_health_pipeline.audits.utilization_audits import run_utilization_audits
from scc_health_pipeline.audits.vintage_audits import run_vintage_audits

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"


def main() -> int:
    print("Running geography audits...")
    geography_report = run_geography_audits(WAREHOUSE_PATH)
    geography_report.print_summary()

    print("\nRunning core sources (Phase 3) audits...")
    core_report = run_core_sources_audits(WAREHOUSE_PATH)
    core_report.print_summary()

    print("\nRunning source freshness/vintage-transparency audit...")
    vintage_report = run_vintage_audits()
    vintage_report.print_summary()

    print("\nRunning analytics (Phase 4) audits...")
    analytics_report = run_analytics_audits(WAREHOUSE_PATH)
    analytics_report.print_summary()

    print("\nRunning resource canonicalization (Phase 6) audits...")
    resource_report = run_resource_canonicalization_audits(WAREHOUSE_PATH)
    resource_report.print_summary()

    print("\nRunning OSM network graph cache (Phase 6) audits...")
    network_graph_report = run_network_graph_audits(REPO_ROOT)
    network_graph_report.print_summary()

    print("\nRunning access metrics (Phase 6) audits...")
    access_metrics_report = run_access_metrics_audits(WAREHOUSE_PATH)
    access_metrics_report.print_summary()

    print("\nRunning ED utilization (Phase 7) audits...")
    utilization_report = run_utilization_audits(WAREHOUSE_PATH)
    utilization_report.print_summary()

    all_passed = (
        geography_report.passed
        and core_report.passed
        and vintage_report.passed
        and analytics_report.passed
        and resource_report.passed
        and network_graph_report.passed
        and access_metrics_report.passed
        and utilization_report.passed
    )

    if WAREHOUSE_PATH.exists():
        _persist_audit_run(
            WAREHOUSE_PATH,
            {
                "geography": geography_report,
                "core_sources": core_report,
                "vintage": vintage_report,
                "analytics": analytics_report,
                "resource_canonicalization": resource_report,
                "network_graph": network_graph_report,
                "access_metrics": access_metrics_report,
                "utilization": utilization_report,
            },
        )

    if not all_passed:
        print("\nOne or more audit suites FAILED.")
        return 1
    print("\nAll audits passed.")
    return 0


def _persist_audit_run(warehouse_path: Path, reports: dict[str, AuditReport]) -> None:
    """Persists every check's pass/fail result to `meta.audit_runs` so
    the Validate page can show real, current audit status via a
    read-only API query instead of requiring a live re-run of
    `make audit` (which imports the full pipeline dependency chain,
    something the API deliberately never does, DEC-022) or shelling out
    to a CLI command from an HTTP request handler."""
    run_at = datetime.now(UTC).isoformat()
    conn = duckdb.connect(str(warehouse_path))
    try:
        conn.execute("CREATE SCHEMA IF NOT EXISTS meta")
        conn.execute("DROP TABLE IF EXISTS meta.audit_runs")
        conn.execute(
            """
            CREATE TABLE meta.audit_runs (
                run_at VARCHAR NOT NULL,
                suite VARCHAR NOT NULL,
                check_name VARCHAR NOT NULL,
                passed BOOLEAN NOT NULL,
                message VARCHAR NOT NULL
            )
            """
        )
        rows = [
            (run_at, suite, finding.check, finding.passed, finding.message)
            for suite, report in reports.items()
            for finding in report.findings
        ]
        if rows:
            conn.executemany(
                "INSERT INTO meta.audit_runs (run_at, suite, check_name, passed, message) "
                "VALUES (?, ?, ?, ?, ?)",
                rows,
            )
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
