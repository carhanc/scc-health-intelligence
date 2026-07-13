"""CLI entrypoint for `make audit`'s geography checks.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_audits
"""

from __future__ import annotations

import sys
from pathlib import Path

from scc_health_pipeline.audits.access_metrics_audits import run_access_metrics_audits
from scc_health_pipeline.audits.analytics_audits import run_analytics_audits
from scc_health_pipeline.audits.core_sources_audits import run_core_sources_audits
from scc_health_pipeline.audits.geography_audits import run_geography_audits
from scc_health_pipeline.audits.network_graph_audits import run_network_graph_audits
from scc_health_pipeline.audits.resource_canonicalization_audits import (
    run_resource_canonicalization_audits,
)
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

    all_passed = (
        geography_report.passed
        and core_report.passed
        and vintage_report.passed
        and analytics_report.passed
        and resource_report.passed
        and network_graph_report.passed
        and access_metrics_report.passed
    )
    if not all_passed:
        print("\nOne or more audit suites FAILED.")
        return 1
    print("\nAll audits passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
