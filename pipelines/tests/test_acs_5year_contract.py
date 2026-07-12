"""Offline contract test for the ACS 5-year adapters.

Fixtures are real subsets: 5 Santa Clara County tract geo-crosswalk rows
and matching B01003 (total population) estimate/MOE rows, plus 1 real
Alameda County row for filter testing.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.sources.acs_5year import AcsGeoCrosswalkAdapter, AcsTableAdapter
from scc_health_pipeline.sources.base import RawArtifact

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _artifact(tmp_path: Path, filename: str, source_id: str) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    fixture_copy = raw_dir / filename
    fixture_copy.write_bytes((FIXTURES_DIR / filename).read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id=source_id,
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="text/plain",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_geo_crosswalk_normalize_extracts_clean_tract_geoid(tmp_path: Path) -> None:
    adapter = AcsGeoCrosswalkAdapter()
    artifact = _artifact(tmp_path, "acs_geo_crosswalk_sample.txt", adapter.source_id)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 5
    assert (df["tract_geoid_2020"].str.len_chars() == 11).all()
    assert (df["tract_geoid_2020"].str.starts_with("06085")).all()


def test_table_adapter_joins_and_computes_standard_error(tmp_path: Path) -> None:
    geo_adapter = AcsGeoCrosswalkAdapter()
    geo_artifact = _artifact(tmp_path, "acs_geo_crosswalk_sample.txt", geo_adapter.source_id)
    geo_outputs = geo_adapter.normalize(geo_artifact)

    table_adapter = AcsTableAdapter("B01003", geo_outputs[0])
    table_artifact = _artifact(tmp_path, "acs_b01003_sample.dat", table_adapter.source_id)
    outputs = table_adapter.normalize(table_artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    # The Alameda row must be excluded by the inner join against the
    # Santa-Clara-only geo crosswalk.
    assert df.height == 5
    assert (df["tract_geoid_2020"].str.starts_with("06085")).all()
    assert (df["estimate"] > 0).all()
    assert (df["standard_error"] > 0).all()

    # Hand-check: tract 06085500100 has estimate=8285, MOE=1000 (90% CI) ->
    # SE = 1000 / 1.645 = 607.90...
    row = df.filter(pl.col("tract_geoid_2020") == "06085500100")
    assert row["estimate"][0] == 8285.0
    assert row["moe_90"][0] == 1000.0
    assert abs(row["standard_error"][0] - (1000.0 / 1.645)) < 0.01


def test_quality_checks_pass_on_fixtures(tmp_path: Path) -> None:
    geo_adapter = AcsGeoCrosswalkAdapter()
    geo_artifact = _artifact(tmp_path, "acs_geo_crosswalk_sample.txt", geo_adapter.source_id)
    geo_outputs = geo_adapter.normalize(geo_artifact)
    geo_report = geo_adapter.quality_checks(geo_outputs)
    assert geo_report.passed  # only a row-count warning expected, not an error

    table_adapter = AcsTableAdapter("B01003", geo_outputs[0])
    table_artifact = _artifact(tmp_path, "acs_b01003_sample.dat", table_adapter.source_id)
    outputs = table_adapter.normalize(table_artifact)
    report = table_adapter.quality_checks(outputs)
    assert report.passed
