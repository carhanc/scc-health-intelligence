"""Integration test: run the full geography audit suite against the real
loaded warehouse. Skipped (not failed) when the warehouse hasn't been built
yet in this environment, since `make data` requires live network access
that CI/offline contexts may not have -- the offline contract tests in
test_source_adapters_contract.py cover adapter logic without network.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from scc_health_pipeline.audits.geography_audits import run_geography_audits

REPO_ROOT = Path(__file__).resolve().parents[2]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"


@pytest.mark.skipif(
    not WAREHOUSE_PATH.exists(),
    reason="warehouse/scc_health.duckdb not built -- run `make data` first",
)
def test_geography_audits_pass_against_live_warehouse() -> None:
    report = run_geography_audits(WAREHOUSE_PATH)
    failed = [f for f in report.findings if not f.passed]
    assert not failed, "\n".join(f"{f.check}: {f.message}" for f in failed)


@pytest.mark.skipif(
    not WAREHOUSE_PATH.exists(),
    reason="warehouse/scc_health.duckdb not built -- run `make data` first",
)
def test_geography_audits_cover_expected_checks() -> None:
    report = run_geography_audits(WAREHOUSE_PATH)
    check_names = {f.check for f in report.findings}
    expected = {
        "tract_geoid_length",
        "tract_geoid_no_duplicates",
        "county_prefix",
        "county_row_geoid",
        "tract_row_count_plausible",
        "supervisor_district_count",
        "crs_plausibility_wgs84",
        "crosswalk_weight_sums",
        "no_orphan_crosswalk_tracts",
        "no_orphan_district_assignments",
        "spatial_join_coverage_tract_to_district",
        "hand_verified_known_tract_exists",
        "hand_verified_district_numbers_1_to_5",
    }
    missing = expected - check_names
    assert not missing, f"Audit suite is missing expected checks: {missing}"
