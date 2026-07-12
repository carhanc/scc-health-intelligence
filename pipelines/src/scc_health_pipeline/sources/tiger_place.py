"""Census TIGER/Line 2020 incorporated place (city) boundaries for California,
filtered spatially to places intersecting Santa Clara County.

Verified 2026-07-11 -- docs/data/source-verification.md §3.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.geography.constants import CRS_WEB_WGS84
from scc_health_pipeline.sources.base import (
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.shapefile_zip import read_shapefile_from_zip
from scc_health_pipeline.sources.tiger_base import TigerZipAdapterMixin, write_geoparquet

ADAPTER_VERSION = "1.0.0"

_URL = "https://www2.census.gov/geo/tiger/TIGER2020/PLACE/tl_2020_06_place.zip"


class TigerPlace2020Adapter(TigerZipAdapterMixin):
    source_id = "tiger_place_2020"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="tl_2020_06_place",
                url=_URL,
                expected_content_type="application/zip",
                description="California 2020 incorporated place boundaries (TIGER/Line).",
            )
        ]

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        gdf = read_shapefile_from_zip(artifact.local_path)
        gdf = gdf.to_crs(CRS_WEB_WGS84)

        # Places are not filtered by county in TIGER/Line (a place can span
        # multiple counties); spatial-filter against the tract layer this
        # adapter run co-produces is done downstream in the harmonization
        # step (pipelines/src/scc_health_pipeline/geography/harmonize.py),
        # which has the tract boundary available. Here we normalize the full
        # California place layer, tagged with its statewide scope.
        out = gdf[
            [
                "GEOID",
                "STATEFP",
                "PLACEFP",
                "NAME",
                "NAMELSAD",
                "LSAD",
                "CLASSFP",
                "ALAND",
                "AWATER",
                "INTPTLAT",
                "INTPTLON",
                "geometry",
            ]
        ].rename(
            columns={
                "GEOID": "place_geoid",
                "STATEFP": "state_fips",
                "PLACEFP": "place_fips",
                "NAME": "name",
                "NAMELSAD": "name_long",
                "LSAD": "legal_statistical_area_desc_code",
                "CLASSFP": "class_fips",
                "ALAND": "area_land_sqm",
                "AWATER": "area_water_sqm",
                "INTPTLAT": "internal_point_lat",
                "INTPTLON": "internal_point_lon",
            }
        )
        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        out_path = staged_dir / "places_california.parquet"
        write_geoparquet(out, out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        import geopandas as gpd

        gdf = gpd.read_parquet(normalized_paths[0])
        if gdf.empty:
            report.add_error("Normalized place table is empty.")
            return report
        if gdf["place_geoid"].duplicated().any():
            report.add_error("Duplicate place GEOIDs found.")
        if not gdf.geometry.is_valid.all():
            report.add_warning("Some place geometries are invalid before repair.")
        # California has 480+ incorporated places statewide.
        if len(gdf) < 300:
            report.add_warning(
                f"Place row count {len(gdf)} looks low for a statewide California file."
            )
        return report
