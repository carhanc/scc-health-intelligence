"""American Community Survey (ACS) 5-year estimates, tract level.

Verified live 2026-07-12. Vintage: 2020-2024 5-year estimates, released
January 2026. Per DECISIONS.md DEC-003, the keyless bulk-download path is
the default (not the live Data API, which now requires CENSUS_API_KEY for
every call -- confirmed during Phase 0 source verification): the
"table-based summary file" product at
https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/,
one pipe-delimited `.dat` file per table
(`data/5YRData/acsdt5y2024-{table_id}.dat`), joined against the geography
crosswalk (`documentation/Geos20245YR.txt`, 90.7MB, confirmed live) whose
`TL_GEO_ID` column is the clean 11-character tract GEOID directly (no
string parsing of the composite `GEO_ID` needed).

Data files use `-555555555` as a sentinel for "margin of error not
applicable" (e.g. for a derived total with no sampling variability) --
this is converted to a genuine null, never treated as a real (and
enormous negative) MOE value.

Scope note: this adapter implements a representative subset of the full
required ACS variable list (docs/02_DATA_SOURCE_REGISTRY.md §4.2) --
total population (B01003), poverty status (B17001), and disability status
(B18101) -- chosen for a defensible mix of value and file size within
this session's time/bandwidth budget (each national table file is
18-120MB). The remaining conceptual measures (language, insurance,
transportation, housing, education, race/ethnicity, etc.) are NOT yet
implemented; this is recorded as an open TASKS.md item, not silently
omitted. Adding a table requires only adding its ID to `TABLE_IDS` below
-- the adapter/geography-join logic is fully general.
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
from scc_health_pipeline.uncertainty.moe import acs_moe_to_standard_error

ADAPTER_VERSION = "1.0.0"

VINTAGE = "2020-2024"
RELEASE_DATE = "2026-01-29"

_BASE_URL = "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF"
_GEO_CROSSWALK_URL = f"{_BASE_URL}/documentation/Geos20245YR.txt"

# Implemented subset -- see module docstring "Scope note".
TABLE_IDS: dict[str, str] = {
    "B01003": "Total population",
    "B17001": "Poverty status by sex by age",
    "B18101": "Sex by age by disability status",
}

_MOE_NOT_APPLICABLE_SENTINEL = -555555555


def _table_url(table_id: str) -> str:
    return f"{_BASE_URL}/data/5YRData/acsdt5y2024-{table_id.lower()}.dat"


class AcsGeoCrosswalkAdapter:
    """Fetches the ACS table-based summary file's geography crosswalk,
    filtered to Santa Clara County tracts. A dependency of every
    AcsTableAdapter instance below -- fetched/normalized once and reused."""

    source_id = "acs_5year_geo_crosswalk"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="acs_geo_crosswalk_2024_5yr",
                url=_GEO_CROSSWALK_URL,
                expected_content_type="text/plain",
                description="ACS 2020-2024 5-year table-based SF geography crosswalk (national).",
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
        if artifact.bytes < 10_000_000:
            report.add_error(f"Geo crosswalk implausibly small ({artifact.bytes} bytes).")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        lazy = pl.scan_csv(
            artifact.local_path,
            separator="|",
            infer_schema_length=0,  # all-string read; this file is metadata, not measures
            quote_char=None,
        )
        filtered = (
            lazy.filter(
                (pl.col("SUMLEVEL") == "140")
                & (pl.col("STATE") == "06")
                & (pl.col("COUNTY") == "085")
            )
            .select(
                [
                    pl.col("GEO_ID").alias("acs_geo_id"),
                    pl.col("TL_GEO_ID").alias("tract_geoid_2020"),
                    pl.col("NAME").alias("tract_name"),
                ]
            )
            .collect()
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "geo_crosswalk.parquet"
        filtered.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("ACS geo crosswalk is empty for Santa Clara County.")
            return report
        if df.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error("Some ACS crosswalk tract GEOIDs are not 11 characters.")
        if df["tract_geoid_2020"].n_unique() != df.height:
            report.add_error("Duplicate tract GEOIDs in ACS geo crosswalk.")
        if df.height != 408:
            report.add_warning(
                f"ACS geo crosswalk has {df.height} Santa Clara tracts, expected 408."
            )
        return report


class AcsTableAdapter:
    """Parameterized by ACS table ID; depends on AcsGeoCrosswalkAdapter's
    already-normalized output (fetched separately, see run_acs_pipeline)."""

    def __init__(self, table_id: str, geo_crosswalk_path: Path) -> None:
        self.table_id = table_id
        self.source_id = f"acs_5year_{table_id.lower()}"
        self._geo_crosswalk_path = geo_crosswalk_path

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id=f"acs_table_{self.table_id.lower()}",
                url=_table_url(self.table_id),
                expected_content_type="text/plain",
                description=(
                    f"ACS 2020-2024 5-year table {self.table_id} "
                    f"({TABLE_IDS.get(self.table_id, 'unknown')}), national, filtered "
                    "to Santa Clara County tracts via the geo crosswalk join."
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
        if artifact.bytes < 1_000_000:
            report.add_error(
                f"ACS table {self.table_id} file implausibly small ({artifact.bytes} bytes)."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        if not self._geo_crosswalk_path.exists():
            raise FileNotFoundError(
                f"ACS geo crosswalk not found at {self._geo_crosswalk_path}. "
                "Run AcsGeoCrosswalkAdapter first."
            )

        crosswalk = pl.read_parquet(self._geo_crosswalk_path)

        df = pl.read_csv(artifact.local_path, separator="|", infer_schema_length=10000)
        df = df.join(crosswalk, left_on="GEO_ID", right_on="acs_geo_id", how="inner")

        # Build long-form: one row per (tract, variable) with estimate + MOE.
        # Column count and names are table-specific (e.g. B01003 has one
        # estimate/MOE cell, B17001 has many poverty-status-by-age-by-sex
        # cells) -- every _E/_M column pair present is captured generically.
        e_cols = [c for c in df.columns if "_E" in c and c != "GEO_ID"]
        records = []
        for e_col in e_cols:
            m_col = e_col.replace("_E", "_M")
            if m_col not in df.columns:
                continue
            sub = df.select(
                [
                    pl.col("tract_geoid_2020"),
                    pl.lit(e_col).alias("variable_id"),
                    pl.col(e_col).cast(pl.Float64, strict=False).alias("estimate"),
                    pl.col(m_col).cast(pl.Float64, strict=False).alias("moe_90"),
                ]
            )
            records.append(sub)

        out = (
            pl.concat(records)
            if records
            else pl.DataFrame(
                schema={
                    "tract_geoid_2020": pl.Utf8,
                    "variable_id": pl.Utf8,
                    "estimate": pl.Float64,
                    "moe_90": pl.Float64,
                }
            )
        )

        # -555555555 = "MOE not applicable" sentinel, never a real MOE.
        out = out.with_columns(
            pl.when(pl.col("moe_90") == _MOE_NOT_APPLICABLE_SENTINEL)
            .then(None)
            .otherwise(pl.col("moe_90"))
            .alias("moe_90")
        )
        out = out.with_columns(
            pl.when(pl.col("moe_90").is_not_null())
            .then(pl.col("moe_90").map_elements(acs_moe_to_standard_error, return_dtype=pl.Float64))
            .otherwise(None)
            .alias("standard_error")
        )
        out = out.with_columns(
            [
                pl.lit(self.table_id).alias("table_id"),
                pl.lit(VINTAGE).alias("vintage"),
                pl.lit(RELEASE_DATE).alias("release_date"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / f"{self.table_id.lower()}.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error(f"Normalized ACS table {self.table_id} is empty.")
            return report
        if df.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error(f"Some ACS {self.table_id} tract GEOIDs are not 11 characters.")
        if (
            df.filter(~pl.col("tract_geoid_2020").str.starts_with(COUNTY_GEOID_SANTA_CLARA)).height
            > 0
        ):
            report.add_error(
                f"Some ACS {self.table_id} rows reference a tract outside Santa Clara County."
            )
        negative_estimates = df.filter(pl.col("estimate").is_not_null() & (pl.col("estimate") < 0))
        if negative_estimates.height > 0:
            report.add_error(f"{negative_estimates.height} rows have a negative estimate.")
        negative_moe = df.filter(pl.col("moe_90").is_not_null() & (pl.col("moe_90") < 0))
        if negative_moe.height > 0:
            report.add_error(
                f"{negative_moe.height} rows have a negative MOE after sentinel handling."
            )
        return report
