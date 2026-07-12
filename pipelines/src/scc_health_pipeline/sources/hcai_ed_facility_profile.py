"""HCAI Emergency Department Characteristics by Facility (Pivot Profile).

Verified live 2026-07-12. Dataset on data.chhs.ca.gov (CKAN package
6d0c3448-6635-45ad-bd16-16eaf9e55ef7 for the current year; the historical
bundle covers 2005-2021 in a separate zip). Each year's workbook has 4
sheets, confirmed against a live download of the 2024 file
(2024-ed-pivot-table.xlsm, 1.3MB):

- "Profile" and "Pivot" -- interactive Excel PivotTable UI sheets with no
  real tabular data (dropdown-driven summary views), NOT parsed by this
  adapter.
- "Data" -- the real flat facility-level table, 177 columns (facility
  identity + disposition/demographic/diagnosis/payer breakdown counts),
  confirmed to contain 10 Santa Clara County facility rows for 2024.
- "INSTRUCTIONS & FOOTNOTES" -- free text, not parsed as data.

`validate_raw` confirms all 4 expected sheets are present (a genuine
schema-drift signal if HCAI restructures the workbook) even though only
"Data" is normalized -- silently accepting a workbook missing "Data"
would be exactly the "silently ignore a failed sheet" failure mode this
adapter must avoid.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry
from scc_health_pipeline.sources.workbook import (
    WorkbookParseError,
    list_sheet_names,
    parse_sheet,
)

ADAPTER_VERSION = "1.0.0"

_URL = (
    "https://data.chhs.ca.gov/dataset/6d0c3448-6635-45ad-bd16-16eaf9e55ef7/resource/"
    "3ae901c1-c276-4376-8374-015f9a8fa973/download/2024-ed-pivot-table.xlsm"
)
REPORTING_YEAR = 2024

_EXPECTED_SHEETS = {"Profile", "Pivot", "Data", "INSTRUCTIONS & FOOTNOTES"}
_DATA_SHEET = "Data"


class HcaiEdFacilityProfileAdapter:
    source_id = "hcai_ed_facility_profile"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id=f"hcai_ed_facility_profile_{REPORTING_YEAR}",
                url=_URL,
                expected_content_type="application/vnd.ms-excel.sheet.macroEnabled.12",
                description=(
                    f"HCAI ED Characteristics by Facility, Pivot Profile, {REPORTING_YEAR}. "
                    "Only the 'Data' sheet is parsed (see module docstring)."
                ),
            )
        ]

    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact:
        return fetch_with_retry(resource, context, source_id=self.source_id)

    def validate_raw(self, artifact: RawArtifact) -> ValidationReport:
        report = ValidationReport()
        if artifact.status == "unavailable":
            report.add_error(f"Fetch failed: {artifact.notes}")
            return report
        if artifact.local_path is None or not artifact.local_path.exists():
            report.add_error("No local file recorded.")
            return report
        if artifact.bytes < 100_000:
            report.add_error(f"Workbook implausibly small ({artifact.bytes} bytes).")
            return report

        try:
            sheet_names = set(list_sheet_names(artifact.local_path))
        except Exception as exc:  # noqa: BLE001 -- any openpyxl failure is a real validation failure
            report.add_error(f"Could not open workbook: {exc}")
            return report

        missing = _EXPECTED_SHEETS - sheet_names
        if missing:
            report.add_error(
                f"Workbook is missing expected sheet(s) {missing} -- possible schema drift. "
                f"Found sheets: {sorted(sheet_names)}"
            )
        if _DATA_SHEET not in sheet_names:
            report.add_error(f"Required '{_DATA_SHEET}' sheet is absent -- cannot proceed.")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        try:
            parsed = parse_sheet(artifact.local_path, _DATA_SHEET)
        except WorkbookParseError as exc:
            raise ValueError(f"Failed to parse the '{_DATA_SHEET}' sheet: {exc}") from exc

        df = pl.from_pandas(parsed.dataframe)
        df = df.filter(pl.col("COUNTY_NAME") == "Santa Clara")
        df = df.with_columns(
            [
                pl.col("oshpd_id").cast(pl.Utf8),
                pl.lit(REPORTING_YEAR).alias("reporting_year"),
                pl.lit(_DATA_SHEET).alias("source_sheet"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / f"ed_facility_profile_{REPORTING_YEAR}.parquet"
        df.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("Normalized ED facility profile table is empty.")
            return report

        if df.filter(pl.col("COUNTY_NAME") != "Santa Clara").height > 0:
            report.add_error("Some rows reference a county other than Santa Clara.")
        if df.filter(pl.col("oshpd_id").is_null()).height > 0:
            report.add_error("Some facilities are missing an oshpd_id.")
        if df["oshpd_id"].n_unique() != df.height:
            report.add_error(
                "Duplicate oshpd_id values found -- expected one row per facility per year."
            )

        return report
