"""HRSA HPSA (Health Professional Shortage Area) and MUA/P (Medically
Underserved Area/Population) designations.

Verified live 2026-07-12. Both confirmed resolving on data.hrsa.gov:
- HPSA Primary Care detail: BCD_HPSA_FCT_DET_PC.csv (48.3MB, updated 2026-07-10)
- HPSA Dental Health detail: BCD_HPSA_FCT_DET_DH.csv
- HPSA Mental Health detail: BCD_HPSA_FCT_DET_MH.csv
- MUA/P detail: MUA_DET.csv (11.3MB, updated 2026-07-10)

Per docs/02_DATA_SOURCE_REGISTRY.md §5.4: "Do not reduce a complex
designation to a binary flag only; show score/status where available."
Each HPSA discipline (primary care, dental, mental health) is kept in a
separate typed table -- never collapsed into one undifferentiated
"has a shortage designation" flag -- and MUA/P is a structurally distinct
designation type, not merged with HPSA.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from scc_health_pipeline.geography.constants import COUNTY_GEOID_SANTA_CLARA
from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry

ADAPTER_VERSION = "1.0.0"

_HPSA_ID_OVERRIDES = {
    "HPSA ID": pl.Utf8,
    "HPSA Geography Identification Number": pl.Utf8,
    "Common State County FIPS Code": pl.Utf8,
    "County or County Equivalent Federal Information Processing Standard Code": pl.Utf8,
    "State and County Federal Information Processing Standard Code": pl.Utf8,
    "State FIPS Code": pl.Utf8,
    "Primary State FIPS Code": pl.Utf8,
    "Common State FIPS Code": pl.Utf8,
    "HPSA Postal Code": pl.Utf8,
    "BHCMIS Organization Identification Number": pl.Utf8,
    "Discipline Class Number": pl.Utf8,
    "HPSA Component Source Identification Number": pl.Utf8,
}

_HPSA_SELECT_COLUMNS = [
    "HPSA Name",
    "HPSA ID",
    "Designation Type",
    "HPSA Discipline Class",
    "HPSA Score",
    "HPSA Status",
    "HPSA Designation Date",
    "HPSA Designation Last Update Date",
    "HPSA Degree of Shortage",
    "HPSA Designation Population",
    "% of Population Below 100% Poverty",
    "HPSA Population Type",
    "Rural Status",
    "Longitude",
    "Latitude",
    "Common County Name",
    "State and County Federal Information Processing Standard Code",
]


class HrsaHpsaAdapter:
    """Parameterized by discipline; instantiate one per HPSA discipline
    (primary care / dental / mental health) so they stay in separate
    tables rather than being collapsed into one undifferentiated measure."""

    def __init__(self, discipline: str, url: str) -> None:
        self.discipline = discipline
        self.url = url
        self.source_id = f"hrsa_hpsa_{discipline}"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id=f"hpsa_{self.discipline}_national",
                url=self.url,
                expected_content_type="text/csv",
                description=(
                    f"Nationwide HRSA HPSA {self.discipline} designations, "
                    "filtered client-side to Santa Clara County."
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
            report.add_error(f"HPSA CSV implausibly small ({artifact.bytes} bytes).")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        df = pl.read_csv(
            artifact.local_path, infer_schema_length=None, schema_overrides=_HPSA_ID_OVERRIDES
        )
        df = df.filter(
            pl.col("State and County Federal Information Processing Standard Code")
            == COUNTY_GEOID_SANTA_CLARA
        )
        out = df.select([pl.col(c) for c in _HPSA_SELECT_COLUMNS if c in df.columns]).rename(
            {
                "HPSA Name": "hpsa_name",
                "HPSA ID": "hpsa_id",
                "Designation Type": "designation_type",
                "HPSA Discipline Class": "discipline",
                "HPSA Score": "hpsa_score",
                "HPSA Status": "status",
                "HPSA Designation Date": "designation_date",
                "HPSA Designation Last Update Date": "last_update_date",
                "HPSA Degree of Shortage": "degree_of_shortage",
                "HPSA Designation Population": "designation_population",
                "% of Population Below 100% Poverty": "pct_population_below_poverty",
                "HPSA Population Type": "population_type",
                "Rural Status": "rural_status",
                "Longitude": "longitude",
                "Latitude": "latitude",
                "Common County Name": "county_name",
                "State and County Federal Information Processing Standard Code": "county_fips",
            }
        )
        out = out.with_columns(
            [
                pl.col("hpsa_score").cast(pl.Float64, strict=False),
                pl.col("longitude").cast(pl.Float64, strict=False),
                pl.col("latitude").cast(pl.Float64, strict=False),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / f"hpsa_{self.discipline}.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_warning(
                f"No HPSA {self.discipline} designations found in Santa Clara County -- "
                "verify this is expected."
            )
            return report
        if "county_fips" in df.columns:
            bad_county = df.filter(pl.col("county_fips") != COUNTY_GEOID_SANTA_CLARA)
            if bad_county.height > 0:
                report.add_error("Some rows reference a county other than Santa Clara.")
        if "hpsa_score" in df.columns:
            out_of_range = df.filter(
                pl.col("hpsa_score").is_not_null()
                & ((pl.col("hpsa_score") < 0) | (pl.col("hpsa_score") > 26))
            )
            if out_of_range.height > 0:
                report.add_warning(
                    f"{out_of_range.height} rows have an HPSA score outside the typical "
                    "0-26 range -- verify against HRSA scoring methodology."
                )
        return report


def primary_care_adapter() -> HrsaHpsaAdapter:
    return HrsaHpsaAdapter(
        "primary_care", "https://data.hrsa.gov/DataDownload/DD_Files/BCD_HPSA_FCT_DET_PC.csv"
    )


def dental_adapter() -> HrsaHpsaAdapter:
    return HrsaHpsaAdapter(
        "dental", "https://data.hrsa.gov/DataDownload/DD_Files/BCD_HPSA_FCT_DET_DH.csv"
    )


def mental_health_adapter() -> HrsaHpsaAdapter:
    return HrsaHpsaAdapter(
        "mental_health", "https://data.hrsa.gov/DataDownload/DD_Files/BCD_HPSA_FCT_DET_MH.csv"
    )


_MUA_ID_OVERRIDES = {
    "MUA/P ID": pl.Utf8,
    "MUA/P Area Code": pl.Utf8,
    "State FIPS Code": pl.Utf8,
    "State and County Federal Information Processing Standard Code": pl.Utf8,
    "County or County Equivalent Federal Information Processing Standard Code": pl.Utf8,
    "Census Tract": pl.Utf8,
    "County Subdivision FIPS Code": pl.Utf8,
}


class HrsaMuaAdapter:
    source_id = "hrsa_mua_p"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="mua_p_national",
                url="https://data.hrsa.gov/DataDownload/DD_Files/MUA_DET.csv",
                expected_content_type="text/csv",
                description=(
                    "Nationwide HRSA Medically Underserved Area/Population designations, "
                    "filtered client-side to Santa Clara County."
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
            report.add_error(f"MUA/P CSV implausibly small ({artifact.bytes} bytes).")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        df = pl.read_csv(
            artifact.local_path, infer_schema_length=None, schema_overrides=_MUA_ID_OVERRIDES
        )
        df = df.filter(
            pl.col("State and County Federal Information Processing Standard Code")
            == COUNTY_GEOID_SANTA_CLARA
        )

        out = df.select(
            [
                pl.col("MUA/P ID").alias("mua_p_id"),
                pl.col("MUA/P Service Area Name").alias("service_area_name"),
                pl.col("Designation Type").alias("designation_type"),
                pl.col("MUA/P Status Description").alias("status"),
                pl.col("MUA/P Designation Date String").alias("designation_date"),
                pl.col("IMU Score").cast(pl.Float64, strict=False).alias("imu_score"),
                pl.col("Population Type").alias("population_type"),
                pl.col("Census Tract").alias("census_tract_raw"),
                pl.col("Complete County Name").alias("county_name"),
                pl.col("State and County Federal Information Processing Standard Code").alias(
                    "county_fips"
                ),
                pl.col("Designation Population in a Medically Underserved Area/Population (MUA/P)")
                .cast(pl.Float64, strict=False)
                .alias("designation_population"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "mua_p.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_warning("No MUA/P designations found in Santa Clara County.")
            return report
        if df.filter(pl.col("county_fips") != COUNTY_GEOID_SANTA_CLARA).height > 0:
            report.add_error("Some rows reference a county other than Santa Clara.")
        out_of_range = df.filter(
            pl.col("imu_score").is_not_null()
            & ((pl.col("imu_score") < 0) | (pl.col("imu_score") > 100))
        )
        if out_of_range.height > 0:
            report.add_warning(f"{out_of_range.height} rows have an IMU score outside [0, 100].")
        return report
