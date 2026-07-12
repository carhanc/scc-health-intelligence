"""HRSA health center service-delivery and look-alike sites.

Verified live 2026-07-12: direct CSV confirmed resolving (200, 13.8MB,
last-modified 2026-07-10) at
https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv
Daily-refreshed nationwide file; filtered client-side to Santa Clara
County via the "State and County Federal Information Processing Standard
Code" field (5-digit county FIPS, confirmed present in the live header).
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

_URL = (
    "https://data.hrsa.gov/DataDownload/DD_Files/"
    "Health_Center_Service_Delivery_and_LookAlike_Sites.csv"
)


class HrsaHealthCentersAdapter:
    source_id = "hrsa_health_center_sites"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="hrsa_health_center_sites_national",
                url=_URL,
                expected_content_type="text/csv",
                description=(
                    "Nationwide HRSA health center service-delivery/look-alike sites, "
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
        if artifact.bytes < 1_000_000:
            report.add_error(
                f"HRSA sites CSV implausibly small ({artifact.bytes} bytes); expected ~13MB."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        # Several administrative/geographic code columns mix numeric-looking
        # values with non-numeric placeholders (e.g. "XX99" for an unassigned
        # congressional district) inconsistently across this 13MB nationwide
        # file -- schema inference on a partial sample misses these and
        # crashes deep into the file. Force every ID/code-like column to
        # string rather than rely on inference at all for them.
        df = pl.read_csv(
            artifact.local_path,
            infer_schema_length=10000,
            schema_overrides={
                "State and County Federal Information Processing Standard Code": pl.Utf8,
                "Health Center Number": pl.Utf8,
                "BPHC Assigned Number": pl.Utf8,
                "Site Postal Code": pl.Utf8,
                "State FIPS and Congressional District Number Code": pl.Utf8,
                "Congressional District Number": pl.Utf8,
                "Congressional District Code": pl.Utf8,
                "State FIPS Code": pl.Utf8,
                "Health Center Organization ZIP Code": pl.Utf8,
            },
        )
        df = df.filter(
            pl.col("State and County Federal Information Processing Standard Code")
            == COUNTY_GEOID_SANTA_CLARA
        )

        out = df.select(
            [
                pl.col("Health Center Number").alias("health_center_number"),
                pl.col("BPHC Assigned Number").alias("bphc_assigned_number"),
                pl.col("Site Name").alias("site_name"),
                pl.col("Health Center Name").alias("organization_name"),
                pl.col("Health Center Type Description").alias("health_center_type"),
                pl.col("Site Address").alias("site_address"),
                pl.col("Site City").alias("site_city"),
                pl.col("Site State Abbreviation").alias("site_state"),
                pl.col("Site Postal Code").alias("site_zip"),
                pl.col("Site Status Description").alias("operating_status"),
                pl.col("Health Center Service Delivery Site Location Setting Description").alias(
                    "location_setting"
                ),
                pl.col("Geocoding Artifact Address Primary X Coordinate")
                .cast(pl.Float64, strict=False)
                .alias("longitude"),
                pl.col("Geocoding Artifact Address Primary Y Coordinate")
                .cast(pl.Float64, strict=False)
                .alias("latitude"),
                pl.col("Complete County Name").alias("county_name"),
                pl.col("Site Added to Scope this Date").alias("added_to_scope_date"),
                pl.col("Data Warehouse Record Create Date").alias("record_create_date"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "health_center_sites.parquet"
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
                "No HRSA health center sites found in Santa Clara County -- verify this is "
                "expected before treating it as a data gap."
            )
            return report

        if df.filter(pl.col("site_name").is_null()).height > 0:
            report.add_error("Some sites are missing a site_name.")

        # Official identifier dedup first (per spec): a site is duplicated
        # only if BOTH the health center number and site name+address match.
        dup_check = df.group_by(["health_center_number", "site_address"]).agg(pl.len().alias("n"))
        dup_count = dup_check.filter(pl.col("n") > 1).height
        if dup_count > 0:
            report.add_warning(
                f"{dup_count} (health_center_number, site_address) combinations appear more "
                "than once -- verify these are genuinely distinct sites, not duplicates."
            )

        coord_present = df.filter(
            pl.col("latitude").is_not_null() & pl.col("longitude").is_not_null()
        )
        out_of_bounds = coord_present.filter(
            (pl.col("latitude") < 36.7)
            | (pl.col("latitude") > 37.7)
            | (pl.col("longitude") < -122.3)
            | (pl.col("longitude") > -121.0)
        )
        if out_of_bounds.height > 0:
            report.add_warning(
                f"{out_of_bounds.height} site(s) fall outside the plausible Santa Clara "
                "County bounding box."
            )
        missing_coords = df.height - coord_present.height
        if missing_coords > 0:
            report.add_warning(f"{missing_coords} site(s) are missing coordinates.")

        return report
