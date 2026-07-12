"""Census cartographic (1:500,000) county boundary, filtered to Santa Clara
County (GEOID 06085).

Verified 2026-07-11 -- docs/data/source-verification.md §3. Uses the
generalized cartographic boundary rather than the 80MB national raw
TIGER/Line county file, per DECISIONS.md DEC-013.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.geography.constants import (
    COUNTY_GEOID_SANTA_CLARA,
    CRS_WEB_WGS84,
)
from scc_health_pipeline.sources.base import (
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.shapefile_zip import read_shapefile_from_zip
from scc_health_pipeline.sources.tiger_base import TigerZipAdapterMixin, write_geoparquet

ADAPTER_VERSION = "1.0.0"

_URL = "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_county_500k.zip"


class CensusCountyCartographicAdapter(TigerZipAdapterMixin):
    source_id = "census_county_cartographic_2020"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="cb_2020_us_county_500k",
                url=_URL,
                expected_content_type="application/zip",
                description=(
                    "National 1:500,000 cartographic county boundaries; filtered "
                    "to Santa Clara County after fetch (national-only file)."
                ),
            )
        ]

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        gdf = read_shapefile_from_zip(artifact.local_path)
        gdf["county_geoid"] = gdf["GEOID"].astype(str)
        gdf = gdf[gdf["county_geoid"] == COUNTY_GEOID_SANTA_CLARA].copy()
        gdf = gdf.to_crs(CRS_WEB_WGS84)
        out = gdf[
            [
                "county_geoid",
                "STATEFP",
                "COUNTYFP",
                "NAME",
                "NAMELSAD",
                "ALAND",
                "AWATER",
                "geometry",
            ]
        ].rename(
            columns={
                "STATEFP": "state_fips",
                "COUNTYFP": "county_fips",
                "NAME": "name",
                "NAMELSAD": "name_long",
                "ALAND": "area_land_sqm",
                "AWATER": "area_water_sqm",
            }
        )
        out["geometry_precision"] = "cartographic_500k"
        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        out_path = staged_dir / "county.parquet"
        write_geoparquet(out, out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        import geopandas as gpd

        gdf = gpd.read_parquet(normalized_paths[0])
        if len(gdf) != 1:
            report.add_error(
                f"Expected exactly 1 county row (Santa Clara), found {len(gdf)}."
            )
            return report
        if gdf.iloc[0]["county_geoid"] != COUNTY_GEOID_SANTA_CLARA:
            report.add_error("County GEOID does not match Santa Clara County (06085).")
        if not gdf.geometry.is_valid.all():
            report.add_warning("County geometry is invalid before repair.")
        return report
