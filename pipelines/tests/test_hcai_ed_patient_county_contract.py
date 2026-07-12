"""Offline contract test for the HCAI ED patient-county adapter.

Fixture (pipelines/fixtures/hcai_ed_disposition_sample.csv) is real data:
2 normal Santa Clara County rows, 2 genuinely suppressed Santa Clara
County rows (real cell-suppression from the live 2024 file), and 1 real
Alameda County row for the county filter.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.hcai_ed_patient_county import HcaiEdPatientCountyAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path, filename: str, breakdown: str) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / filename
    fixture_copy.write_bytes((FIXTURES_DIR / filename).read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id=f"hcai_ed_patient_county_{breakdown}",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_preserves_real_suppression_as_null_not_zero(tmp_path: Path) -> None:
    adapter = HcaiEdPatientCountyAdapter("disposition")
    artifact = _fixture_artifact(tmp_path, "hcai_ed_disposition_sample.csv", "disposition")
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 4  # Alameda row excluded
    assert (df["patient_county_name"] == "Santa Clara").all()

    suppressed = df.filter(pl.col("is_suppressed"))
    assert suppressed.height == 2
    assert suppressed["encounters"].is_null().all()  # never a literal zero
    assert suppressed["suppression_annotation_desc"].str.contains("suppressed").all()

    normal = df.filter(~pl.col("is_suppressed"))
    assert normal.height == 2
    assert normal["encounters"].is_not_null().all()


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = HcaiEdPatientCountyAdapter("disposition")
    artifact = _fixture_artifact(tmp_path, "hcai_ed_disposition_sample.csv", "disposition")
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_quality_checks_catch_suppressed_row_with_literal_zero(tmp_path: Path) -> None:
    adapter = HcaiEdPatientCountyAdapter("disposition")
    artifact = _fixture_artifact(tmp_path, "hcai_ed_disposition_sample.csv", "disposition")
    outputs = adapter.normalize(artifact)

    import polars as pl

    df = pl.read_parquet(outputs[0])
    corrupted = df.with_columns(
        pl.when(pl.col("is_suppressed")).then(0).otherwise(pl.col("encounters")).alias("encounters")
    )
    corrupted.write_parquet(outputs[0])

    report = adapter.quality_checks(outputs)
    assert not report.passed
    assert any("literal zero" in i.message.lower() for i in report.issues)


def test_invalid_breakdown_raises_immediately() -> None:
    import pytest

    with pytest.raises(ValueError):
        HcaiEdPatientCountyAdapter("nonexistent_breakdown")
