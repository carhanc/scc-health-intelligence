"""Offline contract test for the CDC PLACES adapter.

Fixture (pipelines/fixtures/cdc_places_sample.csv) is a real subset of
live-fetched PLACES data (6 Santa Clara County rows for tract
06085500100 across several measures) plus one real Alameda County row
appended to exercise the county filter -- not fabricated data.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.cdc_places import CdcPlacesAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "places_sample.csv"
    fixture_copy.write_bytes((FIXTURES_DIR / "cdc_places_sample.csv").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="cdc_places_tract_2025",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/csv",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_filters_to_santa_clara_county_and_preserves_leading_zeros(
    tmp_path: Path,
) -> None:
    adapter = CdcPlacesAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    # The Alameda County row must be filtered out.
    assert df.height == 6
    assert (df["tract_geoid_2020"] == "06085500100").all()
    assert (df["tract_geoid_2020"].str.len_chars() == 11).all()


def test_normalize_preserves_confidence_limits_and_vintage_labels(tmp_path: Path) -> None:
    adapter = CdcPlacesAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert "low_confidence_limit" in df.columns
    assert "high_confidence_limit" in df.columns
    assert (df["release_vintage"] == "2025 release").all()
    assert (df["underlying_observation_period"] == "BRFSS 2022-2023 (varies by measure)").all()
    # Release label and observation period must be visibly distinct facts,
    # not collapsed into one string (data-vintage transparency requirement).
    assert df["release_vintage"][0] != df["underlying_observation_period"][0]


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = CdcPlacesAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    # Small fixture will warn about tract/measure counts being far below
    # the full-county expectation -- that's correct behavior for a sample,
    # not an error. Only hard errors should fail this test.
    assert report.passed


def test_quality_checks_catch_duplicate_measure_rows(tmp_path: Path) -> None:
    adapter = CdcPlacesAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)

    import polars as pl

    df = pl.read_parquet(outputs[0])
    duplicated = pl.concat([df, df.head(1)])  # inject one real duplicate row
    dup_path = outputs[0].parent / "duplicated.parquet"
    duplicated.write_parquet(dup_path)

    report = adapter.quality_checks([dup_path])
    assert not report.passed
    assert any("duplicate" in i.message.lower() for i in report.issues)


def test_validate_raw_reports_unavailable_status_cleanly() -> None:
    adapter = CdcPlacesAdapter()
    artifact = RawArtifact(
        resource_id="missing",
        source_id=adapter.source_id,
        local_path=None,
        url="https://example.invalid",
        sha256=None,
        bytes=0,
        content_type=None,
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="unavailable",
        notes="All retries exhausted.",
    )
    report = adapter.validate_raw(artifact)
    assert not report.passed
