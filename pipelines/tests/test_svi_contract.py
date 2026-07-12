"""Offline contract test for the CDC/ATSDR SVI adapter.

Fixture (pipelines/fixtures/svi_2022_sample.json) is 3 real tract records
sliced from a live fetch of the ArcGIS FeatureServer response.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.cdc_atsdr_svi import CdcAtsdrSviAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "svi_sample.geojson"
    fixture_copy.write_bytes((FIXTURES_DIR / "svi_2022_sample.json").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="cdc_atsdr_svi_2022",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="application/json",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_preserves_geoid_and_vintage_labels(tmp_path: Path) -> None:
    adapter = CdcAtsdrSviAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 3
    assert (df["tract_geoid_2020"].str.len_chars() == 11).all()
    assert (df["release_vintage"] == "SVI 2022").all()
    assert (df["underlying_observation_period"] == "ACS 2018-2022 5-year estimates").all()


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = CdcAtsdrSviAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_normalize_handles_empty_feature_list(tmp_path: Path) -> None:
    adapter = CdcAtsdrSviAdapter()
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    empty_path = raw_dir / "empty.geojson"
    empty_path.write_text('{"features": []}', encoding="utf-8")
    artifact = RawArtifact(
        resource_id="fixture",
        source_id=adapter.source_id,
        local_path=empty_path,
        url="file://fixture",
        sha256="fixture",
        bytes=empty_path.stat().st_size,
        content_type="application/json",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert not report.passed  # empty table is a truthful failure, not silent success


def test_validate_raw_rejects_malformed_json(tmp_path: Path) -> None:
    adapter = CdcAtsdrSviAdapter()
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    bad_path = raw_dir / "bad.geojson"
    bad_path.write_text("not json at all {{{", encoding="utf-8")
    artifact = RawArtifact(
        resource_id="fixture",
        source_id=adapter.source_id,
        local_path=bad_path,
        url="file://fixture",
        sha256="fixture",
        bytes=bad_path.stat().st_size,
        content_type="application/json",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )
    report = adapter.validate_raw(artifact)
    assert not report.passed
