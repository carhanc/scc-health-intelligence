"""Offline contract test for the CalEnviroScreen 5.0 adapter.

Fixture (pipelines/fixtures/calenviroscreen50_sample.csv) is a real subset
of the live final-release CSV: 3 Santa Clara County tracts + 1 Alameda
County tract (for filter testing).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from scc_health_pipeline.sources.base import RawArtifact, RemoteResource
from scc_health_pipeline.sources.calenviroscreen import CalEnviroScreenAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "ces_sample.csv"
    fixture_copy.write_bytes((FIXTURES_DIR / "calenviroscreen50_sample.csv").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="calenviroscreen_5_0",
        local_path=fixture_copy,
        url="https://data.ca.gov/dataset/72b28c84.../calenviroscreen50_070126.csv",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_filters_to_santa_clara_and_preserves_5_0_indicators(tmp_path: Path) -> None:
    adapter = CalEnviroScreenAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 3  # Alameda row filtered out
    assert (df["tract_geoid_2020"].str.len_chars() == 11).all()
    assert "diabetes" in df.columns
    assert "SmATS" in df.columns
    assert (df["release_vintage"] == "CalEnviroScreen 5.0 (final)").all()


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = CalEnviroScreenAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_fetch_refuses_draft_url() -> None:
    adapter = CalEnviroScreenAdapter()
    draft_resource = RemoteResource(
        resource_id="draft_test",
        url="https://data.ca.gov/dataset/draft-calenviroscreen-5-0/resource/x/download/calenviroscreen50csv_d_12226.csv",
        expected_content_type="text/csv",
    )
    with pytest.raises(ValueError, match="draft"):
        adapter.fetch(draft_resource, context=None)  # type: ignore[arg-type]


def test_validate_raw_catches_draft_marker_in_fetched_url(tmp_path: Path) -> None:
    adapter = CalEnviroScreenAdapter()
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "ces_sample.csv"
    fixture_copy.write_bytes((FIXTURES_DIR / "calenviroscreen50_sample.csv").read_bytes())
    artifact = RawArtifact(
        resource_id="fixture",
        source_id="calenviroscreen_5_0",
        local_path=fixture_copy,
        url="https://data.ca.gov/dataset/draft-calenviroscreen-5-0/download/calenviroscreen50csv_d_12226.csv",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )
    report = adapter.validate_raw(artifact)
    assert not report.passed
