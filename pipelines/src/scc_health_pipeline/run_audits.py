"""CLI entrypoint for `make audit`'s geography checks.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_audits
"""

from __future__ import annotations

import sys
from pathlib import Path

from scc_health_pipeline.audits.geography_audits import run_geography_audits

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"


def main() -> int:
    print("Running geography audits...")
    report = run_geography_audits(WAREHOUSE_PATH)
    report.print_summary()
    if not report.passed:
        print("\nGeography audits FAILED.")
        return 1
    print("\nAll geography audits passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
