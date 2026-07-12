"""Offline contract tests for the HRSA HPSA and MUA/P adapters.

Fixtures are real subsets: 3 Santa Clara County rows + 1 other-county row
each, sliced from live-fetched data.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.hrsa_shortage_areas import HrsaMuaAdapter, primary_care_adapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _artifact(tmp_path: Path, fixture_name: str, source_id: str) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / fixture_name
    fixture_copy.write_bytes((FIXTURES_DIR / fixture_name).read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id=source_id,
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_hpsa_normalize_filters_to_santa_clara_county(tmp_path: Path) -> None:
    adapter = primary_care_adapter()
    artifact = _artifact(tmp_path, "hrsa_hpsa_pc_sample.csv", adapter.source_id)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 3
    assert (df["county_fips"] == "06085").all()
    assert (df["discipline"] == "Primary Care").all()


def test_hpsa_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = primary_care_adapter()
    artifact = _artifact(tmp_path, "hrsa_hpsa_pc_sample.csv", adapter.source_id)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_mua_normalize_filters_to_santa_clara_county(tmp_path: Path) -> None:
    adapter = HrsaMuaAdapter()
    artifact = _artifact(tmp_path, "hrsa_mua_sample.csv", adapter.source_id)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 3
    assert (df["county_fips"] == "06085").all()


def test_mua_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = HrsaMuaAdapter()
    artifact = _artifact(tmp_path, "hrsa_mua_sample.csv", adapter.source_id)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_hpsa_disciplines_use_distinct_source_ids() -> None:
    from scc_health_pipeline.sources.hrsa_shortage_areas import (
        dental_adapter,
        mental_health_adapter,
    )

    ids = {
        primary_care_adapter().source_id,
        dental_adapter().source_id,
        mental_health_adapter().source_id,
    }
    assert len(ids) == 3  # never collapsed into one undifferentiated measure
