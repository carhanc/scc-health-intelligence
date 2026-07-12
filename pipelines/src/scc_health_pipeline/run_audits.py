"""CLI entrypoint for `make audit`'s geography checks.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_audits
"""

from __future__ import annotations

import sys
from pathlib import Path

from scc_health_pipeline.audits.core_sources_audits import run_core_sources_audits
from scc_health_pipeline.audits.geography_audits import run_geography_audits
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

    all_passed = geography_report.passed and core_report.passed and vintage_report.passed
    if not all_passed:
        print("\nOne or more audit suites FAILED.")
        return 1
    print("\nAll audits passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
