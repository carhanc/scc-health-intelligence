"""HCAI Emergency Department characteristics by patient county of residence.

Verified live 2026-07-12. Dataset "Hospital Emergency Department -
Characteristics by Patient County of Residence" (data.chhs.ca.gov, CKAN
package b91d0f25-d2b1-4c9f-b22d-13be3a6c5c90). Published as separate CSVs
per breakdown, not one combined file: disposition, race group, sex,
expected payer, each 2008-2024 with masked/suppressed cells preserved
(never treated as zero -- an `AnnotationCode`/`AnnotationDesc` column
documents the suppression reason directly in the source).

Native geography is patient COUNTY OF RESIDENCE (by name, e.g. "Santa
Clara"), not tract and not a facility location -- these are aggregate
resident-origin counts, not tract-level outcomes and not facility-level
data (docs/02_DATA_SOURCE_REGISTRY.md §5.1: "Do not infer patient-level
records from aggregates.").

Usage governed by CHHS Terms of Use / HCAI-OPA framework: no modification
of the raw data; commercial use requires separate authorization.
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

ADAPTER_VERSION = "1.0.0"

_SANTA_CLARA_COUNTY_NAME = "Santa Clara"

_BREAKDOWN_URLS = {
    "disposition": (
        "https://data.chhs.ca.gov/dataset/b91d0f25-d2b1-4c9f-b22d-13be3a6c5c90/resource/"
        "be06665a-7695-4a0b-af07-f0556d7e6707/download/disposition_ed_2024masked.csv"
    ),
    "race_group": (
        "https://data.chhs.ca.gov/dataset/b91d0f25-d2b1-4c9f-b22d-13be3a6c5c90/resource/"
        "fd061afe-9bf2-48d9-bd2d-bb7965ebdf2b/download/racegroup_ed_2024_masked.csv"
    ),
    "sex": (
        "https://data.chhs.ca.gov/dataset/b91d0f25-d2b1-4c9f-b22d-13be3a6c5c90/resource/"
        "3875b73d-4f1f-4fc5-8233-c30e25156961/download/sex_ed_m_2024_masked.csv"
    ),
    "expected_payer": (
        "https://data.chhs.ca.gov/dataset/b91d0f25-d2b1-4c9f-b22d-13be3a6c5c90/resource/"
        "d5369f5c-6152-40a9-9c2a-309fd2086116/download/expectedpayer_ed_m_2024_masked.csv"
    ),
}

# The breakdown-value column name differs slightly per file (confirmed
# against live headers): "Disposition", "Race Group", "Gender",
# "Expected Payer". The year column also varies in casing ("Service
# year" vs "Service Year").
_BREAKDOWN_VALUE_COLUMN = {
    "disposition": "Disposition",
    "race_group": "Race Group",
    "sex": "Gender",
    "expected_payer": "Expected Payer",
}


class HcaiEdPatientCountyAdapter:
    """Parameterized by breakdown (disposition/race_group/sex/expected_payer)
    so each characteristic stays in its own typed table."""

    def __init__(self, breakdown: str) -> None:
        if breakdown not in _BREAKDOWN_URLS:
            raise ValueError(f"Unknown HCAI ED patient-county breakdown: {breakdown}")
        self.breakdown = breakdown
        self.source_id = f"hcai_ed_patient_county_{breakdown}"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id=f"hcai_ed_patient_county_{self.breakdown}",
                url=_BREAKDOWN_URLS[self.breakdown],
                expected_content_type="text/csv",
                description=(
                    f"HCAI ED encounters by patient county of residence, {self.breakdown} "
                    "breakdown, filtered client-side to Santa Clara County."
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
        if artifact.bytes < 1000:
            report.add_error(
                f"HCAI ED patient-county CSV implausibly small ({artifact.bytes} bytes)."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        df = pl.read_csv(artifact.local_path, infer_schema_length=None)
        # Year column casing varies by file; normalize to a single name.
        year_col = "Service year" if "Service year" in df.columns else "Service Year"
        value_col = _BREAKDOWN_VALUE_COLUMN[self.breakdown]

        df = df.filter(pl.col("Patient County") == _SANTA_CLARA_COUNTY_NAME)

        out = df.select(
            [
                pl.col("Patient County").alias("patient_county_name"),
                pl.col(year_col).cast(pl.Int32, strict=False).alias("service_year"),
                pl.col(value_col).alias("category_value"),
                pl.col("Encounters").cast(pl.Int64, strict=False).alias("encounters"),
                pl.col("AnnotationCode").alias("suppression_annotation_code"),
                pl.col("AnnotationDesc").alias("suppression_annotation_desc"),
                pl.lit(self.breakdown).alias("breakdown_category"),
            ]
        )
        # Never treat a suppressed (null Encounters) row as zero.
        out = out.with_columns(
            pl.col("suppression_annotation_code").is_not_null().alias("is_suppressed")
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / f"ed_patient_county_{self.breakdown}.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error(f"Normalized HCAI ED {self.breakdown} table is empty.")
            return report

        if df.filter(pl.col("patient_county_name") != _SANTA_CLARA_COUNTY_NAME).height > 0:
            report.add_error("Some rows reference a county other than Santa Clara.")

        # Suppressed rows must have a null encounters value, never zero.
        suppressed_but_zero = df.filter(pl.col("is_suppressed") & (pl.col("encounters") == 0))
        if suppressed_but_zero.height > 0:
            report.add_error(
                f"{suppressed_but_zero.height} suppressed row(s) have encounters=0 -- "
                "suppression must never be represented as a literal zero."
            )
        suppressed_without_null = df.filter(
            pl.col("is_suppressed") & pl.col("encounters").is_not_null()
        )
        if suppressed_without_null.height > 0:
            report.add_warning(
                f"{suppressed_without_null.height} row(s) are flagged suppressed but have a "
                "non-null encounters value -- verify the source's masking convention."
            )

        negative_encounters = df.filter(
            pl.col("encounters").is_not_null() & (pl.col("encounters") < 0)
        )
        if negative_encounters.height > 0:
            report.add_error(f"{negative_encounters.height} row(s) have negative encounter counts.")

        return report


def all_breakdown_adapters() -> list[HcaiEdPatientCountyAdapter]:
    return [HcaiEdPatientCountyAdapter(b) for b in _BREAKDOWN_URLS]
