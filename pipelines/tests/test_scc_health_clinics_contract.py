"""Offline contract test for the SCC health-clinics adapter. Fixture is 5
real features from the live ArcGIS FeatureServer, verified during Phase 6.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl
from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.scc_health_clinics import SccHealthClinicsAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    fixture_copy = raw_dir / "scc_health_clinics_sample.json"
    fixture_copy.write_bytes((FIXTURES_DIR / "scc_health_clinics_sample.json").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id=SccHealthClinicsAdapter.source_id,
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="application/json",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_extracts_point_coordinates_and_names(tmp_path: Path) -> None:
    adapter = SccHealthClinicsAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    assert len(outputs) == 1

    df = pl.read_parquet(outputs[0])
    assert df.height == 5
    assert (df["center_name"] != "").all()
    assert df["latitude"].is_not_null().all()
    assert df["longitude"].is_not_null().all()
    # Real values from the fixture, not fabricated.
    assert "AACI" in df["center_name"].to_list()


def test_quality_checks_pass_on_clean_fixture(tmp_path: Path) -> None:
    adapter = SccHealthClinicsAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    report = adapter.quality_checks(outputs)
    # The 5-row fixture is smaller than the live ~99-row dataset, so a
    # "too few rows" warning is expected -- it must still pass overall.
    assert report.passed, [i.message for i in report.issues if i.severity == "error"]
    assert any("Only 5 clinics found" in i.message for i in report.issues)


def test_quality_checks_reject_missing_name(tmp_path: Path) -> None:
    adapter = SccHealthClinicsAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    df = pl.read_parquet(outputs[0])
    corrupted = df.with_columns(
        pl.when(pl.int_range(pl.len()) == 0)
        .then(pl.lit(""))
        .otherwise(pl.col("center_name"))
        .alias("center_name")
    )
    bad_path = outputs[0].parent / "corrupted.parquet"
    corrupted.write_parquet(bad_path)
    report = adapter.quality_checks([bad_path])
    assert not report.passed
