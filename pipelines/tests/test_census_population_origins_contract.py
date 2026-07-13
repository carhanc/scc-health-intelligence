"""Offline contract test for the population-weighted origins adapter
(DEC-044). Fixture is a real subset: 5 real Santa Clara County block-group
rows and 2 real Alameda County rows (for county-filter testing) from the
live CenPop2020_Mean_BG06.txt file, verified live during Phase 6.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl
from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.census_population_origins import CenPopBlockGroupAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    fixture_copy = raw_dir / "cenpop2020_mean_bg_ca_sample.txt"
    fixture_copy.write_bytes(
        (FIXTURES_DIR / "cenpop2020_mean_bg_ca_sample.txt").read_bytes()
    )
    return RawArtifact(
        resource_id="fixture",
        source_id=CenPopBlockGroupAdapter.source_id,
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/plain",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_normalize_filters_to_santa_clara_county_and_builds_geoids(tmp_path: Path) -> None:
    adapter = CenPopBlockGroupAdapter()
    artifact = _artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    df = pl.read_parquet(outputs[0])
    # 5 Santa Clara rows in the fixture, 2 Alameda rows filtered out.
    assert df.height == 5
    assert (df["tract_geoid_2020"].str.starts_with("06085")).all()
    assert (df["tract_geoid_2020"].str.len_chars() == 11).all()
    assert (df["block_group_geoid"].str.len_chars() == 12).all()
    # Leading zero preserved as a string, never coerced to a number.
    assert df["tract_geoid_2020"][0] == "06085500100"
    assert df["block_group_geoid"][0] == "060855001001"


def test_multiple_block_groups_share_one_tract(tmp_path: Path) -> None:
    adapter = CenPopBlockGroupAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    df = pl.read_parquet(outputs[0])
    # The fixture has 4 block groups in tract 06085500100 -- the
    # "multiple weighted origin points within a tract" case this adapter
    # exists to produce (docs/03 §2.5).
    assert df.filter(pl.col("tract_geoid_2020") == "06085500100").height == 4


def test_quality_checks_pass_on_clean_fixture(tmp_path: Path) -> None:
    adapter = CenPopBlockGroupAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    report = adapter.quality_checks(outputs)
    assert report.passed, [i.message for i in report.issues if i.severity == "error"]


def test_quality_checks_reject_out_of_county_geoid(tmp_path: Path) -> None:
    adapter = CenPopBlockGroupAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    df = pl.read_parquet(outputs[0])
    # Simulate a filter bug: an Alameda-County-prefixed row slipping through.
    corrupted = df.vstack(
        pl.DataFrame(
            {
                "block_group_geoid": ["060014001001"],
                "tract_geoid_2020": ["06001400100"],
                "population": [100],
                "latitude": [37.86],
                "longitude": [-122.23],
            }
        )
    )
    bad_path = outputs[0].parent / "corrupted.parquet"
    corrupted.write_parquet(bad_path)
    report = adapter.quality_checks([bad_path])
    assert not report.passed


def test_quality_checks_reject_out_of_bounds_coordinates(tmp_path: Path) -> None:
    adapter = CenPopBlockGroupAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    df = pl.read_parquet(outputs[0])
    corrupted = df.with_columns(pl.Series("latitude", [0.0] * df.height))
    bad_path = outputs[0].parent / "corrupted_coords.parquet"
    corrupted.write_parquet(bad_path)
    report = adapter.quality_checks([bad_path])
    assert not report.passed


def test_zero_population_block_group_is_warned_not_dropped(tmp_path: Path) -> None:
    adapter = CenPopBlockGroupAdapter()
    outputs = adapter.normalize(_artifact(tmp_path))
    df = pl.read_parquet(outputs[0])
    zeroed = df.with_columns(
        pl.when(pl.int_range(pl.len()) == 0)
        .then(0)
        .otherwise(pl.col("population"))
        .alias("population")
    )
    path = outputs[0].parent / "zeroed.parquet"
    zeroed.write_parquet(path)
    report = adapter.quality_checks([path])
    assert report.passed  # zero population is a warning, not an error
    assert any("zero reported population" in i.message for i in report.issues)
