"""Offline contract test for the VTA GTFS adapter.

Fixture (pipelines/fixtures/vta_gtfs_sample.zip) is a real subset of a
live-fetched GTFS feed: 2 routes, their trips, referenced stop_times,
referenced stops, referenced calendar rows -- so foreign-key relationships
are genuinely internally consistent, exercising the same FK-validation
logic that would catch a real feed corruption.
"""

from __future__ import annotations

import zipfile
from pathlib import Path

from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.vta_gtfs import VtaGtfsAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "gtfs_sample.zip"
    fixture_copy.write_bytes((FIXTURES_DIR / "vta_gtfs_sample.zip").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="vta_gtfs",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="application/zip",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_validate_raw_confirms_required_tables_present(tmp_path: Path) -> None:
    adapter = VtaGtfsAdapter()
    artifact = _fixture_artifact(tmp_path)
    report = adapter.validate_raw(artifact)
    assert report.passed


def test_normalize_produces_six_tables_with_string_ids(tmp_path: Path) -> None:
    adapter = VtaGtfsAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 6

    import polars as pl

    stops = pl.read_parquet(outputs[0])
    stop_times = pl.read_parquet(outputs[3])
    assert stops["stop_id"].dtype == pl.Utf8
    assert stop_times["stop_id"].dtype == pl.Utf8
    assert stop_times["trip_id"].dtype == pl.Utf8


def test_quality_checks_pass_with_no_orphan_foreign_keys(tmp_path: Path) -> None:
    adapter = VtaGtfsAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_quality_checks_catch_orphan_stop_time_trip_id(tmp_path: Path) -> None:
    adapter = VtaGtfsAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)

    import polars as pl

    stop_times_path = outputs[3]
    df = pl.read_parquet(stop_times_path)
    corrupted = pl.concat(
        [df, df.head(1).with_columns(pl.lit("nonexistent_trip_id").alias("trip_id"))]
    )
    corrupted.write_parquet(stop_times_path)

    report = adapter.quality_checks(outputs)
    assert not report.passed
    assert any(
        "orphan" in i.message.lower() or "absent" in i.message.lower() for i in report.issues
    )


def test_validate_raw_rejects_malformed_zip(tmp_path: Path) -> None:
    adapter = VtaGtfsAdapter()
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    bad_zip = raw_dir / "corrupt.zip"
    bad_zip.write_bytes(b"not a real zip file")
    artifact = RawArtifact(
        resource_id="fixture",
        source_id="vta_gtfs",
        local_path=bad_zip,
        url="file://fixture",
        sha256="fixture",
        bytes=bad_zip.stat().st_size,
        content_type="application/zip",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )
    report = adapter.validate_raw(artifact)
    assert not report.passed


def test_validate_raw_catches_missing_required_table(tmp_path: Path) -> None:
    adapter = VtaGtfsAdapter()
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    incomplete_zip = raw_dir / "incomplete.zip"
    with zipfile.ZipFile(incomplete_zip, "w") as zf:
        zf.writestr("agency.txt", "agency_id,agency_name\nVTA,VTA\n")
        # stops.txt, routes.txt, trips.txt, stop_times.txt all missing
    artifact = RawArtifact(
        resource_id="fixture",
        source_id="vta_gtfs",
        local_path=incomplete_zip,
        url="file://fixture",
        sha256="fixture",
        bytes=incomplete_zip.stat().st_size,
        content_type="application/zip",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )
    report = adapter.validate_raw(artifact)
    assert not report.passed
    assert len(report.issues) >= 4  # missing stops/routes/trips/stop_times
