"""USDA SNAP retailer locator data (historical authorization file).

Verified live 2026-07-12. USDA FNS was renamed the Food and Nutrition
Administration (FNA) effective June 1, 2026; the canonical domain is now
`fna.usda.gov`. The bulk download link was scraped from the live retailer-
locator page (https://www.fna.usda.gov/snap/retailer-locator/data) rather
than guessed:
https://www.fna.usda.gov/sites/default/files/resource-files/snap-retailer-locator-data2005-2025.zip
(confirmed 200, 24MB zip containing a single 95MB CSV, last-modified
2026-02-19). Legacy `fns.usda.gov` URLs 301-redirect to the fna.usda.gov
equivalent -- confirmed live, so either host currently works, but this
adapter targets the new canonical fna.usda.gov host directly.

This is a HISTORICAL file (2005-2025) covering both currently-authorized
and deauthorized retailers; "currently authorized" is derived from a blank
End Date, not assumed from row presence alone.
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

_URL = (
    "https://www.fna.usda.gov/sites/default/files/resource-files/"
    "snap-retailer-locator-data2005-2025.zip"
)

RELEASE_LABEL = "Historical SNAP Retailer Locator Data 2005-2025"

_CA_STATE_ABBR = "CA"
_SANTA_CLARA_COUNTY_NAME = "SANTA CLARA"


class UsdaSnapRetailersAdapter:
    source_id = "usda_snap_retailers"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="snap_retailer_locator_historical",
                url=_URL,
                expected_content_type="application/zip",
                description=(
                    f"{RELEASE_LABEL}, filtered client-side to Santa Clara "
                    "County, CA (no server-side filtering available for this "
                    "flat historical file)."
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
                f"SNAP retailer zip implausibly small ({artifact.bytes} bytes); expected ~24MB."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        import zipfile

        with zipfile.ZipFile(artifact.local_path) as zf:
            csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            if not csv_names:
                raise ValueError("No CSV file found inside the SNAP retailer zip.")
            with zf.open(csv_names[0]) as fh:
                df = pl.read_csv(
                    fh,
                    infer_schema_length=10000,
                    schema_overrides={"Record ID": pl.Utf8, "Zip Code": pl.Utf8, "Zip4": pl.Utf8},
                )

        df = df.filter(
            (pl.col("State") == _CA_STATE_ABBR)
            & (pl.col("County").str.to_uppercase() == _SANTA_CLARA_COUNTY_NAME)
        )

        out = df.select(
            [
                pl.col("Record ID").alias("record_id"),
                pl.col("Store Name").str.strip_chars().alias("store_name"),
                pl.col("Store Type").alias("store_type"),
                pl.col("Street Number").alias("street_number"),
                pl.col("Street Name").alias("street_name"),
                pl.col("City").alias("city"),
                pl.col("State").alias("state"),
                pl.col("Zip Code").alias("zip_code"),
                pl.col("County").alias("county_name"),
                pl.col("Latitude").cast(pl.Float64, strict=False).alias("latitude"),
                pl.col("Longitude").cast(pl.Float64, strict=False).alias("longitude"),
                pl.col("Authorization Date").alias("authorization_date"),
                pl.col("End Date").alias("end_date"),
                (pl.col("End Date").is_null() | (pl.col("End Date").str.strip_chars() == "")).alias(
                    "currently_authorized"
                ),
                pl.lit(RELEASE_LABEL).alias("release_vintage"),
            ]
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "snap_retailers.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("Normalized SNAP retailer table is empty.")
            return report

        bad_county = df.filter(pl.col("county_name").str.to_uppercase() != _SANTA_CLARA_COUNTY_NAME)
        if bad_county.height > 0:
            report.add_error("Some rows reference a county other than Santa Clara.")

        # (0, 0) is "Null Island" -- a common sentinel for a missing/failed
        # geocode, not a real retailer location off the coast of Africa.
        null_island = df.filter((pl.col("latitude") == 0) & (pl.col("longitude") == 0))
        if null_island.height > 0:
            report.add_warning(
                f"{null_island.height} retailer(s) have (0, 0) coordinates -- "
                "likely a failed geocode, not a real location."
            )

        out_of_bounds = df.filter(
            pl.col("latitude").is_not_null()
            & pl.col("longitude").is_not_null()
            & ~((pl.col("latitude") == 0) & (pl.col("longitude") == 0))
            & (
                (pl.col("latitude") < 36.7)
                | (pl.col("latitude") > 37.7)
                | (pl.col("longitude") < -122.3)
                | (pl.col("longitude") > -121.0)
            )
        )
        if out_of_bounds.height > 0:
            report.add_warning(
                f"{out_of_bounds.height} retailer(s) fall outside the plausible Santa Clara "
                "County bounding box."
            )

        currently_authorized_count = df.filter(pl.col("currently_authorized")).height
        report.add_warning(
            f"{currently_authorized_count} of {df.height} historical Santa Clara County "
            "records are currently authorized (End Date blank); the remainder are "
            "historical/deauthorized and retained for completeness, not filtered out."
        )

        return report
