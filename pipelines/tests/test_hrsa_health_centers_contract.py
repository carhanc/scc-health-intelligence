"""Offline contract test for the HRSA health center sites adapter.

Fixture (pipelines/fixtures/hrsa_health_centers_sample.csv) is a real
subset: 3 Santa Clara County sites + 1 Ohio site (for the county filter).
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.hrsa_health_centers import HrsaHealthCentersAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "hrsa_sample.csv"
    fixture_copy.write_bytes((FIXTURES_DIR / "hrsa_health_centers_sample.csv").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="hrsa_health_center_sites",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_filters_to_santa_clara_county(tmp_path: Path) -> None:
    adapter = HrsaHealthCentersAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 3  # Ohio row excluded
    assert "NEMS PACE San Jose Center" in df["site_name"].to_list()


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = HrsaHealthCentersAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed
