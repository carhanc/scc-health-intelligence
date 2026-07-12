"""Offline contract test for the HCAI facility attributes adapter.

Fixture (pipelines/fixtures/hcai_facility_attributes_sample.csv) is a real
subset: 3 Santa Clara County facilities (Gilroy, San Jose x2) + 1 real
Fontana, CA facility (San Bernardino County) to exercise the spatial join.
Uses the real Phase 2 county boundary (data/curated/county.parquet), so
this test requires `make data` to have been run at least once.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.hcai_facility_attributes import HcaiFacilityAttributesAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
REPO_ROOT = Path(__file__).resolve().parents[2]
COUNTY_BOUNDARY_PATH = REPO_ROOT / "data" / "curated" / "county.parquet"

pytestmark = pytest.mark.skipif(
    not COUNTY_BOUNDARY_PATH.exists(),
    reason="data/curated/county.parquet not built -- run `make data` first",
)


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "hcai_facility_sample.csv"
    fixture_copy.write_bytes((FIXTURES_DIR / "hcai_facility_attributes_sample.csv").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="hcai_facility_attributes",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_filters_via_spatial_join(tmp_path: Path) -> None:
    adapter = HcaiFacilityAttributesAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    # Fontana (San Bernardino County) must be excluded by the spatial join.
    assert df.height == 3
    assert "Fontana" not in df["site_city"].str.to_titlecase().to_list()
    assert set(df["site_city"].str.to_titlecase().to_list()) <= {"San Jose", "Gilroy"}


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = HcaiFacilityAttributesAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed
