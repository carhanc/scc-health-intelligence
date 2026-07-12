"""CDC PLACES tract-level modeled health estimates.

Verified live 2026-07-12 -- dataset "PLACES: Local Data for Better Health,
Census Tract Data, 2025 release" on Socrata (data.cdc.gov), dataset ID
`cwsq-ngmh`, confirmed resolving with 16,320 Santa Clara County records
(408 tracts x 40 measures, exact match against the Phase 2 geography
spine's tract count). Based on BRFSS ~2022-2023 observations -- the 2025
release label and the underlying survey period are different facts, both
preserved (see docs/07_BUILD_PHASES.md "data-vintage transparency").

Socrata dataset IDs rotate between annual releases; this adapter pins the
verified ID rather than a discovery API, since CDC does not expose a
title-search catalog API as reliable as Socrata's own metadata endpoint
used here for verification (see socrata.py).
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

SOCRATA_DOMAIN = "data.cdc.gov"
DATASET_ID = "cwsq-ngmh"
RELEASE_LABEL = "2025 release"
# BRFSS reference period varies by measure (most 2023, five measures 2022) --
# recorded here as the coarse adapter-level label; per-measure precision
# would require CDC's measure-definitions crosswalk, out of Phase 3 scope.
UNDERLYING_OBSERVATION_PERIOD = "BRFSS 2022-2023 (varies by measure)"

_QUERY_URL = (
    f"https://{SOCRATA_DOMAIN}/resource/{DATASET_ID}.csv"
    "?$where=locationid like '06085%25'"
    "&$limit=50000"
)

_EXPECTED_TRACT_COUNT = 408
_EXPECTED_MEASURE_COUNT_RANGE = (35, 45)  # PLACES publishes ~40 measures


class CdcPlacesAdapter:
    source_id = "cdc_places_tract_2025"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="places_tract_santa_clara",
                url=_QUERY_URL,
                expected_content_type="text/csv",
                description=(
                    f"CDC PLACES {RELEASE_LABEL}, census tract data, "
                    "filtered server-side to Santa Clara County tracts."
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
                f"Response implausibly small ({artifact.bytes} bytes) for ~16,000 PLACES rows."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        # CLAUDE.md: "Never allow CSV type inference to convert GEOIDs to
        # integers." Polars' default schema inference reads countyfips/
        # locationid as Int64 (stripping the leading zero -- "06085"
        # becomes 6085), which silently broke the county filter below
        # during Phase 3 development. Force these columns to string at
        # read time rather than casting after the fact.
        df = pl.read_csv(
            artifact.local_path,
            infer_schema_length=10000,
            schema_overrides={"countyfips": pl.Utf8, "locationid": pl.Utf8},
        )

        # Field-based filter (never substring outside the server-side query
        # already applied) -- re-verify client-side too, since the
        # server-side $where is a defense-in-depth belt-and-suspenders
        # check, not the sole guarantee.
        df = df.filter(pl.col("countyfips").str.zfill(5) == COUNTY_GEOID_SANTA_CLARA)

        long_form = df.select(
            [
                pl.col("locationid").cast(pl.Utf8).str.zfill(11).alias("tract_geoid_2020"),
                pl.col("year").cast(pl.Utf8),
                pl.col("categoryid").alias("category_id"),
                pl.col("category"),
                pl.col("measureid").alias("measure_id"),
                pl.col("measure").alias("measure_name"),
                pl.col("short_question_text"),
                pl.col("data_value_type"),
                pl.col("data_value").cast(pl.Float64, strict=False),
                pl.col("data_value_unit"),
                pl.col("low_confidence_limit").cast(pl.Float64, strict=False),
                pl.col("high_confidence_limit").cast(pl.Float64, strict=False),
                pl.col("totalpopulation").cast(pl.Int64, strict=False).alias("total_population"),
                pl.col("totalpop18plus")
                .cast(pl.Int64, strict=False)
                .alias("total_population_18plus"),
                pl.col("data_value_footnote_symbol").alias("suppression_flag"),
                pl.lit(RELEASE_LABEL).alias("release_vintage"),
                pl.lit(UNDERLYING_OBSERVATION_PERIOD).alias("underlying_observation_period"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "places_long.parquet"
        long_form.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("Normalized PLACES table is empty.")
            return report

        if df.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error("Some PLACES tract GEOIDs are not 11 characters.")
        if (
            df.filter(~pl.col("tract_geoid_2020").str.starts_with(COUNTY_GEOID_SANTA_CLARA)).height
            > 0
        ):
            report.add_error("Some PLACES rows reference a tract outside Santa Clara County.")

        distinct_tracts = df["tract_geoid_2020"].n_unique()
        if distinct_tracts != _EXPECTED_TRACT_COUNT:
            report.add_warning(
                f"PLACES covers {distinct_tracts} distinct tracts, expected "
                f"{_EXPECTED_TRACT_COUNT} (matching the Phase 2 geography spine). "
                "PLACES excludes tracts with adult population < 50; a mismatch may "
                "be expected, but should be reconciled against geo.tracts."
            )

        distinct_measures = df["measure_id"].n_unique()
        low, high = _EXPECTED_MEASURE_COUNT_RANGE
        if not (low <= distinct_measures <= high):
            report.add_warning(
                f"PLACES covers {distinct_measures} distinct measures, expected {low}-{high}."
            )

        duplicates = df.group_by(["tract_geoid_2020", "measure_id", "data_value_type"]).agg(
            pl.len().alias("n")
        )
        dup_count = duplicates.filter(pl.col("n") > 1).height
        if dup_count > 0:
            report.add_error(
                f"{dup_count} duplicate (tract, measure, data_value_type) combinations found."
            )

        invalid_ci = df.filter(
            pl.col("low_confidence_limit").is_not_null()
            & pl.col("high_confidence_limit").is_not_null()
            & (pl.col("low_confidence_limit") > pl.col("high_confidence_limit"))
        )
        if invalid_ci.height > 0:
            report.add_error(
                f"{invalid_ci.height} rows have low_confidence_limit > high_confidence_limit."
            )

        out_of_bounds_pct = df.filter(
            (pl.col("data_value_unit") == "%")
            & ((pl.col("data_value") < 0) | (pl.col("data_value") > 100))
        )
        if out_of_bounds_pct.height > 0:
            report.add_error(
                f"{out_of_bounds_pct.height} percentage-unit rows fall outside [0, 100]."
            )

        null_data_value = df.filter(pl.col("data_value").is_null()).height
        if null_data_value > 0:
            report.add_warning(
                f"{null_data_value} rows have a null data_value -- verify these carry a "
                "suppression_flag rather than being an unexplained gap."
            )

        return report
