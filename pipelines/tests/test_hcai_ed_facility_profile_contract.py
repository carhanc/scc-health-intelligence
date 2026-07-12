"""Offline contract test for the HCAI ED facility profile adapter.

Fixture (pipelines/fixtures/hcai_ed_facility_profile_sample.xlsm) is a
real 4-sheet workbook subset: placeholder Profile/Pivot sheets (matching
the real structure, since those sheets are template UI, not data), a real
Data sheet with 3 Santa Clara County facilities + 1 other-county facility,
and an INSTRUCTIONS & FOOTNOTES sheet.
"""

from __future__ import annotations

from pathlib import Path

import openpyxl
from scc_health_pipeline.sources.base import RawArtifact
from scc_health_pipeline.sources.hcai_ed_facility_profile import HcaiEdFacilityProfileAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _fixture_artifact(tmp_path: Path) -> RawArtifact:
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    fixture_copy = raw_dir / "ed_facility_sample.xlsm"
    fixture_copy.write_bytes((FIXTURES_DIR / "hcai_ed_facility_profile_sample.xlsm").read_bytes())
    return RawArtifact(
        resource_id="fixture",
        source_id="hcai_ed_facility_profile",
        local_path=fixture_copy,
        url="file://fixture",
        sha256="fixture",
        bytes=fixture_copy.stat().st_size,
        content_type="application/vnd.ms-excel.sheet.macroEnabled.12",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )


def test_validate_raw_confirms_all_four_sheets_present(tmp_path: Path) -> None:
    adapter = HcaiEdFacilityProfileAdapter()
    artifact = _fixture_artifact(tmp_path)
    report = adapter.validate_raw(artifact)
    # The fixture is deliberately much smaller than a real ~1.3MB workbook,
    # so it legitimately trips the byte-size sanity check -- this test is
    # specifically about the sheet-presence check, not the size check.
    assert not any("missing expected sheet" in i.message.lower() for i in report.issues)
    assert not any("required 'data' sheet is absent" in i.message.lower() for i in report.issues)


def test_normalize_parses_only_data_sheet_and_filters_county(tmp_path: Path) -> None:
    adapter = HcaiEdFacilityProfileAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    assert len(outputs) == 1

    import polars as pl

    df = pl.read_parquet(outputs[0])
    assert df.height == 3  # other-county row excluded
    assert (df["COUNTY_NAME"] == "Santa Clara").all()
    assert (df["source_sheet"] == "Data").all()


def test_quality_checks_pass_on_fixture(tmp_path: Path) -> None:
    adapter = HcaiEdFacilityProfileAdapter()
    artifact = _fixture_artifact(tmp_path)
    outputs = adapter.normalize(artifact)
    report = adapter.quality_checks(outputs)
    assert report.passed


def test_validate_raw_catches_missing_data_sheet(tmp_path: Path) -> None:
    adapter = HcaiEdFacilityProfileAdapter()
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    bad_path = raw_dir / "missing_data_sheet.xlsx"
    wb = openpyxl.Workbook()
    wb.active.title = "Profile"
    wb.save(bad_path)
    artifact = RawArtifact(
        resource_id="fixture",
        source_id="hcai_ed_facility_profile",
        local_path=bad_path,
        url="file://fixture",
        sha256="fixture",
        bytes=bad_path.stat().st_size,
        content_type="application/vnd.ms-excel.sheet.macroEnabled.12",
        retrieved_at="2026-07-12T00:00:00+00:00",
        status="success",
    )
    report = adapter.validate_raw(artifact)
    assert not report.passed
