"""Offline contract test for the USDA SNAP retailer adapter.

Fixture (pipelines/fixtures/snap_retailers_sample.zip) is a real subset:
4 Santa Clara County retailers + 1 Alaska retailer (for the county filter).
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.usda_snap_retailers import UsdaSnapRetailersAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "snap_sample.zip"
    fixture_copy.write_bytes((FIXTURES_DIR / "snap_retailers_sample.zip").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="usda_snap_retailers",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="application/zip",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_filters_to_santa_clara_county(tmp_path: Path) -> None:
    adapter = UsdaSnapRetailersAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 4  # Alaska row excluded
    assert (df["county_name"].str.to_uppercase() == "SANTA CLARA").all()
    assert "currently_authorized" in df.columns


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = UsdaSnapRetailersAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_quality_checks_flag_null_island_coordinates(tmp_path: Path) -> None:
    adapter = UsdaSnapRetailersAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)

    import polars as pl

    df = pl.read_parquet(outputs[0])
    is_first = pl.int_range(pl.len()) == 0
    corrupted = df.with_columns(
        [
            pl.when(is_first).then(0.0).otherwise(pl.col("latitude")).alias("latitude"),
            pl.when(is_first).then(0.0).otherwise(pl.col("longitude")).alias("longitude"),
        ]
    )
    corrupted.write_parquet(outputs[0])
    report = adapter.quality_checks(outputs)
    assert any("null island" in i.message.lower() or "0, 0" in i.message for i in report.issues)
