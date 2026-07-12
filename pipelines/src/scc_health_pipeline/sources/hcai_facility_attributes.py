"""HCAI licensed healthcare facility attributes.

Verified live 2026-07-12. Dataset "Facility Profile Attributes" on
data.chhs.ca.gov (CKAN package ID 8b82d5b9-fc18-4eb6-a4f3-e8a639d92796),
CC-BY licensed. The CSV resource filename is date-stamped and changes on
each weekly update (confirmed via the CKAN API, e.g.
"facilityprofile_2026-07-06.csv") -- this adapter discovers the current
resource URL through the CKAN `package_show` API rather than hardcoding a
dated filename that would go stale.

No county/FIPS field exists in this file (confirmed against the live
header, 110 columns). Coordinates are present as `site_x_coordinate`
(longitude) / `site_y_coordinate` (latitude) under non-standard names --
Santa Clara County membership is determined by a point-in-polygon spatial
join against the Phase 2 canonical county boundary (geo.county), per the
source-verification recommendation to prefer a spatial join over
error-prone ZIP/city text matching.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import httpx
import polars as pl
from shapely.geometry import Point

from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry

ADAPTER_VERSION = "1.0.0"

_CKAN_PACKAGE_ID = "8b82d5b9-fc18-4eb6-a4f3-e8a639d92796"
_CKAN_PACKAGE_SHOW_URL = f"https://data.chhs.ca.gov/api/3/action/package_show?id={_CKAN_PACKAGE_ID}"
_RESOURCE_NAME = "Facility Profile Attributes"

# Last-verified fallback (2026-07-12) if the CKAN discovery call fails --
# matches the "pinned last-verified fallback" pattern used for CDC PLACES.
_FALLBACK_URL = (
    f"https://data.chhs.ca.gov/dataset/{_CKAN_PACKAGE_ID}/resource/"
    "29afed21-d976-4dc9-9684-7be21e96ded5/download/facilityprofile_2026-07-06.csv"
)

_SELECT_COLUMNS = [
    "facility_desc",
    "site_address1",
    "site_address2",
    "site_city",
    "site_zip",
    "site_x_coordinate",
    "site_y_coordinate",
    "oshpd_id",
    "license_type_desc",
    "license_category_desc",
    "license_number",
    "facility_level_desc",
    "er_service_level_desc",
    "licensed_beds",
    "facility_status_desc",
]


def _discover_current_csv_url() -> str:
    try:
        response = httpx.get(_CKAN_PACKAGE_SHOW_URL, timeout=30.0)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        for resource in payload.get("result", {}).get("resources", []):
            if resource.get("name") == _RESOURCE_NAME and str(resource.get("url", "")).endswith(
                ".csv"
            ):
                return str(resource["url"])
    except (httpx.HTTPError, KeyError, ValueError):
        pass
    return _FALLBACK_URL


class HcaiFacilityAttributesAdapter:
    source_id = "hcai_facility_attributes"

    def __init__(self) -> None:
        # Warehouse path for the county boundary spatial join, resolved
        # lazily in normalize() so discover()/fetch() never need it.
        self._county_boundary_path = (
            Path(__file__).resolve().parents[4] / "data" / "curated" / "county.parquet"
        )

    def discover(self) -> list[RemoteResource]:
        url = _discover_current_csv_url()
        return [
            RemoteResource(
                resource_id="hcai_facility_profile_attributes",
                url=url,
                expected_content_type="text/csv",
                description=(
                    "HCAI Facility Profile Attributes (CC-BY), statewide; filtered to "
                    "Santa Clara County via spatial join against the Phase 2 county boundary."
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
        if artifact.bytes < 10_000:
            report.add_error(f"Facility attributes CSV implausibly small ({artifact.bytes} bytes).")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        if not self._county_boundary_path.exists():
            raise FileNotFoundError(
                f"Phase 2 county boundary not found at {self._county_boundary_path}. "
                "Run `make data` (geography spine) before this adapter."
            )

        df = pl.read_csv(
            artifact.local_path,
            infer_schema_length=None,
            columns=_SELECT_COLUMNS,
            schema_overrides={"oshpd_id": pl.Utf8, "site_zip": pl.Utf8, "license_number": pl.Utf8},
        )
        df = df.with_columns(
            [
                pl.col("site_x_coordinate").cast(pl.Float64, strict=False).alias("longitude"),
                pl.col("site_y_coordinate").cast(pl.Float64, strict=False).alias("latitude"),
            ]
        )

        pdf = df.to_pandas()
        has_coords = pdf["longitude"].notna() & pdf["latitude"].notna()
        coord_rows = pdf[has_coords].copy()

        county_gdf = gpd.read_parquet(self._county_boundary_path)
        county_geom = county_gdf.union_all()

        coord_rows["geometry"] = [
            Point(lon, lat)
            for lon, lat in zip(coord_rows["longitude"], coord_rows["latitude"], strict=False)
        ]
        coord_gdf = gpd.GeoDataFrame(coord_rows, geometry="geometry", crs="EPSG:4326")
        in_county = coord_gdf[coord_gdf.geometry.within(county_geom)]

        out = pl.from_pandas(in_county.drop(columns="geometry"))
        out = out.drop(["site_x_coordinate", "site_y_coordinate"])

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "facility_attributes.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error(
                "Normalized facility attributes table is empty -- verify the spatial "
                "join and coordinate parsing are working correctly."
            )
            return report

        if df.filter(pl.col("oshpd_id").is_null()).height > 0:
            report.add_warning("Some facilities are missing an oshpd_id.")
        if df["oshpd_id"].n_unique() != df.height:
            report.add_warning(
                "Duplicate oshpd_id values found -- this file may include multiple "
                "period rows per facility (financial reporting periods), not one row "
                "per facility; verify before treating row count as facility count."
            )

        return report
