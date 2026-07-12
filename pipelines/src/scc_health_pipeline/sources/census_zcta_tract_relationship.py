"""Census 2020 ZCTA-to-tract relationship file -- the default (keyless)
ZIP/ZCTA-to-tract crosswalk (DECISIONS.md DEC-005).

Verified 2026-07-11 -- docs/data/source-verification.md §5. This is a
national flat pipe-delimited file (no state partition available), so it is
fetched once in full and filtered by exact tract-GEOID-prefix matching --
never by substring search, since ZCTA values can numerically collide with
county FIPS codes (e.g. ZCTA 06085 is a Connecticut ZIP, not Santa Clara
County's 06085 FIPS code -- confirmed during Phase 2 verification).
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

_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt"

_SCHEMA = {
    "OID_ZCTA5_20": pl.Utf8,
    "GEOID_ZCTA5_20": pl.Utf8,
    "NAMELSAD_ZCTA5_20": pl.Utf8,
    "AREALAND_ZCTA5_20": pl.Float64,
    "AREAWATER_ZCTA5_20": pl.Float64,
    "MTFCC_ZCTA5_20": pl.Utf8,
    "CLASSFP_ZCTA5_20": pl.Utf8,
    "FUNCSTAT_ZCTA5_20": pl.Utf8,
    "OID_TRACT_20": pl.Utf8,
    "GEOID_TRACT_20": pl.Utf8,
    "NAMELSAD_TRACT_20": pl.Utf8,
    "AREALAND_TRACT_20": pl.Float64,
    "AREAWATER_TRACT_20": pl.Float64,
    "MTFCC_TRACT_20": pl.Utf8,
    "FUNCSTAT_TRACT_20": pl.Utf8,
    "AREALAND_PART": pl.Float64,
    "AREAWATER_PART": pl.Float64,
}


class CensusZctaTractRelationshipAdapter:
    source_id = "census_zcta_tract_relationship_2020"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="tab20_zcta520_tract20_natl",
                url=_URL,
                expected_content_type="text/plain",
                description=(
                    "National 2020 ZCTA-to-tract area relationship file "
                    "(keyless default crosswalk, DEC-005)."
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
                f"Relationship file implausibly small ({artifact.bytes} bytes); "
                "expected ~24MB for the national file."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        df = pl.read_csv(
            artifact.local_path,
            separator="|",
            schema_overrides=_SCHEMA,
            null_values=[""],
            encoding="utf8-lossy",  # source file has a leading UTF-8 BOM
        )

        # Field-based filter (never substring match -- see module docstring).
        scc_rows = df.filter(
            pl.col("GEOID_TRACT_20").str.slice(0, 5) == COUNTY_GEOID_SANTA_CLARA
        )
        scc_rows_with_zcta = scc_rows.filter(pl.col("GEOID_ZCTA5_20").is_not_null())

        relevant_zctas = scc_rows_with_zcta["GEOID_ZCTA5_20"].unique().to_list()

        # Correct denominator: total land-area-part for each relevant ZCTA
        # computed across ALL of its tracts nationally (a ZCTA can straddle
        # county lines), not just the Santa Clara County subset.
        zcta_totals = (
            df.filter(pl.col("GEOID_ZCTA5_20").is_in(relevant_zctas))
            .group_by("GEOID_ZCTA5_20")
            .agg(pl.col("AREALAND_PART").sum().alias("zcta_total_arealand_part"))
        )

        crosswalk = scc_rows_with_zcta.join(zcta_totals, on="GEOID_ZCTA5_20", how="left")
        crosswalk = crosswalk.with_columns(
            (pl.col("AREALAND_PART") / pl.col("zcta_total_arealand_part")).alias("weight")
        ).select(
            [
                pl.col("GEOID_ZCTA5_20").alias("zcta_geoid"),
                pl.col("GEOID_TRACT_20").alias("tract_geoid_2020"),
                pl.col("AREALAND_PART").alias("area_land_part_sqm"),
                pl.col("zcta_total_arealand_part").alias("zcta_total_area_land_sqm"),
                pl.col("weight"),
                pl.lit("area_weighted_census_relationship").alias("allocation_method"),
                pl.lit("moderate_confidence_crosswalk").alias("allocation_quality"),
            ]
        )

        # Unassigned tract-land slivers with no ZCTA (real, rare edge case --
        # confirmed 4 such rows for Santa Clara County during verification).
        # Retained separately for audit transparency, not silently dropped.
        unassigned = scc_rows.filter(pl.col("GEOID_ZCTA5_20").is_null()).select(
            [
                pl.col("GEOID_TRACT_20").alias("tract_geoid_2020"),
                pl.col("AREALAND_PART").alias("area_land_part_sqm"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        crosswalk_path = staged_dir / "zcta_tract_crosswalk.parquet"
        unassigned_path = staged_dir / "unassigned_tract_land.parquet"
        crosswalk.write_parquet(crosswalk_path)
        unassigned.write_parquet(unassigned_path)
        return [crosswalk_path, unassigned_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        crosswalk = pl.read_parquet(normalized_paths[0])
        if crosswalk.is_empty():
            report.add_error("Crosswalk table is empty.")
            return report

        # Per-ZCTA weights must sum to ~1 across all tracts it touches
        # (docs/02_DATA_SOURCE_REGISTRY.md §4.4: "verify each source
        # geography's weights sum approximately to one"). Note: a ZCTA whose
        # weight sums to <1 here is expected when it extends into another
        # county -- that remainder legitimately allocates to tracts outside
        # Santa Clara County and is not an error in this table.
        sums = crosswalk.group_by("zcta_geoid").agg(pl.col("weight").sum().alias("weight_sum"))
        out_of_range = sums.filter((pl.col("weight_sum") <= 0) | (pl.col("weight_sum") > 1.0001))
        if not out_of_range.is_empty():
            report.add_error(
                f"{len(out_of_range)} ZCTA(s) have a Santa-Clara-portion weight sum "
                "outside (0, 1] -- indicates a computation error, not just a "
                f"cross-county ZCTA: {out_of_range['zcta_geoid'].to_list()}"
            )
        if crosswalk.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error("Some crosswalk tract GEOIDs are not 11 characters.")
        not_scc = crosswalk.filter(
            ~pl.col("tract_geoid_2020").str.starts_with(COUNTY_GEOID_SANTA_CLARA)
        )
        if not_scc.height > 0:
            report.add_error("Some crosswalk rows reference a tract outside Santa Clara County.")
        return report
