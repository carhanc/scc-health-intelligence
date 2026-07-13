"""Population-weighted origin points for access analysis (Phase 6 Access
Lab), per docs/03_ANALYTICS_METHODS.md §2.5's preferred hierarchy: "block-
or block-group-population-weighted representative origins" ranks above a
tract's plain geometric centroid.

Uses the U.S. Census Bureau's own 2020 Mean Center of Population file,
published per block group -- this *is* the population-weighted origin the
docs ask for, computed and published by the same authoritative agency as
every other population figure this platform uses (DEC-044). No block-group
boundary geometry ingestion or from-scratch weighting computation is
needed: the file already gives one population-weighted lat/lon point per
block group, with its population count.

A tract typically has 2-4 block groups, so this yields multiple weighted
origins per tract -- exactly the "multiple weighted origin points within
tracts" option docs/03 lists as the second-preference method (this session
uses it because it comes for free with the point-per-block-group source,
even though the source technically satisfies the top-preference option
too, since each point already IS population-weighted within its block
group).
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from scc_health_pipeline.geography.constants import (
    COUNTY_FIPS_SANTA_CLARA,
    STATE_FIPS_CA,
)
from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry

ADAPTER_VERSION = "1.0.0"

VINTAGE = "2020 Census (Mean Center of Population)"
RELEASE_DATE = "2021-08-12"  # CenPop2020 first published release

_URL = "https://www2.census.gov/geo/docs/reference/cenpop2020/blkgrp/CenPop2020_Mean_BG06.txt"

# Plausible Santa Clara County bounding box (docs/02 §4.3-style sanity
# check, matching the box already used by the resource-adapter quality
# checks elsewhere in this pipeline).
_LAT_MIN, _LAT_MAX = 36.7, 37.7
_LON_MIN, _LON_MAX = -122.3, -121.0


class CenPopBlockGroupAdapter:
    """2020 mean center of population, one row per California block group,
    filtered client-side to Santa Clara County (06085) -- the file has no
    server-side county filter, so the whole state file (~1MB, all block
    groups) is fetched and filtered locally, matching the same pattern
    already used for the ACS geography crosswalk."""

    source_id = "census_cenpop_2020_block_group"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="cenpop2020_mean_bg_ca",
                url=_URL,
                expected_content_type="text/plain",
                description=(
                    "U.S. Census Bureau 2020 mean center of population by block group, "
                    "California statewide, filtered to Santa Clara County."
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
            report.add_error(f"CenPop2020 file implausibly small ({artifact.bytes} bytes).")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        df = pl.read_csv(
            artifact.local_path,
            infer_schema_length=0,  # all-string read; cast explicitly below
        )
        # Header uses a BOM-prefixed first column name on some mirrors;
        # normalize defensively rather than assuming byte-for-byte purity.
        df = df.rename({df.columns[0]: "STATEFP"})

        filtered = df.filter(
            (pl.col("STATEFP") == STATE_FIPS_CA) & (pl.col("COUNTYFP") == COUNTY_FIPS_SANTA_CLARA)
        ).with_columns(
            [
                (pl.col("STATEFP") + pl.col("COUNTYFP") + pl.col("TRACTCE")).alias(
                    "tract_geoid_2020"
                ),
                (
                    pl.col("STATEFP")
                    + pl.col("COUNTYFP")
                    + pl.col("TRACTCE")
                    + pl.col("BLKGRPCE")
                ).alias("block_group_geoid"),
                pl.col("POPULATION").cast(pl.Int64).alias("population"),
                pl.col("LATITUDE").cast(pl.Float64).alias("latitude"),
                pl.col("LONGITUDE").cast(pl.Float64).alias("longitude"),
            ]
        ).select(
            [
                "block_group_geoid",
                "tract_geoid_2020",
                "population",
                "latitude",
                "longitude",
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "block_group_population_origins.parquet"
        filtered.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("No Santa Clara County block groups found.")
            return report

        if df.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error("Some tract_geoid_2020 values are not 11 characters.")
        if df.filter(pl.col("block_group_geoid").str.len_chars() != 12).height > 0:
            report.add_error("Some block_group_geoid values are not 12 characters.")
        if not (df["tract_geoid_2020"].str.starts_with("06085")).all():
            report.add_error("Some rows reference a tract outside Santa Clara County (06085).")
        if df["block_group_geoid"].n_unique() != df.height:
            report.add_error("Duplicate block_group_geoid values.")

        out_of_bounds = df.filter(
            (pl.col("latitude") < _LAT_MIN)
            | (pl.col("latitude") > _LAT_MAX)
            | (pl.col("longitude") < _LON_MIN)
            | (pl.col("longitude") > _LON_MAX)
        )
        if out_of_bounds.height > 0:
            report.add_error(
                f"{out_of_bounds.height} block-group origin(s) fall outside the plausible "
                "Santa Clara County bounding box."
            )

        negative_pop = df.filter(pl.col("population") < 0)
        if negative_pop.height > 0:
            report.add_error(f"{negative_pop.height} block group(s) have negative population.")

        zero_pop = df.filter(pl.col("population") == 0)
        if zero_pop.height > 0:
            # Expected, not an error: a handful of block groups (e.g.
            # industrial/airport/park land) genuinely have zero residents.
            report.add_warning(
                f"{zero_pop.height} block group(s) have zero reported population "
                "(expected for non-residential areas; contributes zero weight, not dropped)."
            )

        if df.height < 900 or df.height > 1400:
            report.add_warning(
                f"{df.height} Santa Clara County block groups found; expected roughly "
                "1,100-1,200 based on live verification. Re-verify if this drifts further."
            )

        return report
