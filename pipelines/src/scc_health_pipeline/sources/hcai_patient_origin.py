"""HCAI Patient Origin/Market Share (Pivot Profile) -- Inpatient, ED, and
Ambulatory Surgery.

Verified live 2026-07-12. Dataset on data.chhs.ca.gov (CKAN package
dcb1799d-ddfa-485e-bc35-f86357f08e01), most recent year 2024. Workbook has
3 sheets: "Patient Origin" and "Market Share" are interactive Excel
PivotTable UI views (not parsed -- same pattern as the ED facility
profile workbook), "Data" is the real flat table, confirmed live: columns
`oshpd_id, pattype, PZIP, pcounty, FACILITY_NAME, COUNTY_NAME, discharges,
year`.

Native geography is patient ZIP (PZIP) and patient county of residence
(pcounty) -- both retained as-is, NEVER silently converted to tract
without the approved Phase 2 ZCTA-tract crosswalk and its documented
uncertainty (docs/03_ANALYTICS_METHODS.md §2.3). Rows are kept if EITHER
the facility or the patient's county of residence is Santa Clara, since
this single file supports both "who comes to Santa Clara facilities"
(patient origin) and "where do Santa Clara residents go" (market
share/leakage) questions.

Known limitation (per source verification): physician-owned ambulatory
surgery clinics do not report to HCAI and are excluded from this product
-- ambulatory-surgery market-share totals are incomplete by design.
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
    "https://data.chhs.ca.gov/dataset/dcb1799d-ddfa-485e-bc35-f86357f08e01/resource/"
    "940326be-d80f-4e2b-9cba-1f9e3b912cd7/download/2024-patient-origin-market-share.xlsx"
)
REPORTING_YEAR = 2024

_EXPECTED_SHEETS = {"Patient Origin", "Market Share", "Data"}
_DATA_SHEET = "Data"
_SANTA_CLARA_COUNTY_NAME = "SANTA CLARA"

AMBULATORY_SURGERY_EXCLUSION_NOTE = (
    "Physician-owned ambulatory surgery clinics do not report to HCAI and are "
    "excluded from this product; ambulatory-surgery market-share totals are "
    "incomplete by design, not a data quality defect."
)


class HcaiPatientOriginAdapter:
    source_id = "hcai_patient_origin_market_share"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id=f"hcai_patient_origin_{REPORTING_YEAR}",
                url=_URL,
                expected_content_type=(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ),
                description=(
                    f"HCAI Patient Origin/Market Share Pivot Profile, {REPORTING_YEAR}. "
                    "Only the 'Data' sheet is parsed."
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
        except Exception as exc:  # noqa: BLE001
            report.add_error(f"Could not open workbook: {exc}")
            return report
        missing = _EXPECTED_SHEETS - sheet_names
        if missing:
            report.add_error(f"Workbook is missing expected sheet(s) {missing}.")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        try:
            parsed = parse_sheet(artifact.local_path, _DATA_SHEET)
        except WorkbookParseError as exc:
            raise ValueError(f"Failed to parse the '{_DATA_SHEET}' sheet: {exc}") from exc

        df = pl.from_pandas(parsed.dataframe)
        df = df.with_columns(
            [
                pl.col("oshpd_id").cast(pl.Utf8),
                pl.col("PZIP").cast(pl.Utf8).str.zfill(5).alias("patient_zip"),
                pl.col("pcounty").alias("patient_county_name"),
                pl.col("COUNTY_NAME").alias("facility_county_name"),
                pl.col("discharges").cast(pl.Int64, strict=False),
            ]
        )
        df = df.filter(
            (pl.col("facility_county_name").str.to_uppercase() == _SANTA_CLARA_COUNTY_NAME)
            | (pl.col("patient_county_name").str.to_uppercase() == _SANTA_CLARA_COUNTY_NAME)
        )
        df = df.with_columns(
            [
                pl.lit(REPORTING_YEAR).alias("reporting_year"),
                pl.lit(AMBULATORY_SURGERY_EXCLUSION_NOTE).alias("known_limitation"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / f"patient_origin_{REPORTING_YEAR}.parquet"
        df.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("Normalized patient-origin table is empty.")
            return report

        relevant = df.filter(
            (pl.col("facility_county_name").str.to_uppercase() == _SANTA_CLARA_COUNTY_NAME)
            | (pl.col("patient_county_name").str.to_uppercase() == _SANTA_CLARA_COUNTY_NAME)
        )
        if relevant.height != df.height:
            report.add_error(
                "Some rows reference neither a Santa Clara facility nor a Santa Clara patient."
            )

        negative_discharges = df.filter(
            pl.col("discharges").is_not_null() & (pl.col("discharges") < 0)
        )
        if negative_discharges.height > 0:
            report.add_error(f"{negative_discharges.height} rows have negative discharge counts.")

        bad_zip = df.filter(pl.col("patient_zip").str.len_chars() != 5)
        if bad_zip.height > 0:
            report.add_warning(
                f"{bad_zip.height} rows have a patient ZIP that is not exactly 5 characters."
            )

        return report
