"""Census TIGER/Line 2020 census tract boundaries (canonical geography unit).

Verified 2026-07-11 -- docs/data/source-verification.md §3, DECISIONS.md
DEC-004 (pinned to the 2020 tract vintage for alignment with ACS/PLACES/SVI).
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.geography.constants import (
    COUNTY_FIPS_SANTA_CLARA,
    CRS_WEB_WGS84,
    STATE_FIPS_CA,
    TRACT_GEOID_LENGTH,
)
from scc_health_pipeline.sources.base import (
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.shapefile_zip import read_shapefile_from_zip
from scc_health_pipeline.sources.tiger_base import TigerZipAdapterMixin, write_geoparquet

ADAPTER_VERSION = "1.0.0"

_URL = "https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_06_tract.zip"


class TigerTract2020Adapter(TigerZipAdapterMixin):
    source_id = "tiger_tract_2020"

    def discover(self) -> list[RemoteResource]:
        # Census does not expose a discovery/metadata API for direct-download
        # TIGER/Line files (unlike CDC PLACES' Socrata catalog); the URL
        # pattern (tl_{vintage}_{state_fips}_{layer}.zip) is stable and was
        # verified live at build time (docs/data/source-verification.md §3).
        return [
            RemoteResource(
                resource_id="tl_2020_06_tract",
                url=_URL,
                expected_content_type="application/zip",
                description="California 2020 Census tract boundaries (TIGER/Line).",
            )
        ]

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        gdf = read_shapefile_from_zip(artifact.local_path)
        gdf = gdf[gdf["COUNTYFP"] == COUNTY_FIPS_SANTA_CLARA].copy()
        gdf["tract_geoid_2020"] = gdf["GEOID"].astype(str).str.zfill(TRACT_GEOID_LENGTH)
        gdf = gdf.to_crs(CRS_WEB_WGS84)
        out = gdf[
            [
                "tract_geoid_2020",
                "STATEFP",
                "COUNTYFP",
                "TRACTCE",
                "NAME",
                "NAMELSAD",
                "ALAND",
                "AWATER",
                "INTPTLAT",
                "INTPTLON",
                "geometry",
            ]
        ].rename(
            columns={
                "STATEFP": "state_fips",
                "COUNTYFP": "county_fips",
                "TRACTCE": "tract_code",
                "NAME": "name",
                "NAMELSAD": "name_long",
                "ALAND": "area_land_sqm",
                "AWATER": "area_water_sqm",
                "INTPTLAT": "internal_point_lat",
                "INTPTLON": "internal_point_lon",
            }
        )
        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        out_path = staged_dir / "tracts.parquet"
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
            report.add_error("Normalized tract table is empty.")
            return report
        if not (gdf["tract_geoid_2020"].str.len() == TRACT_GEOID_LENGTH).all():
            report.add_error("Not all tract GEOIDs are exactly 11 characters.")
        expected_prefix = STATE_FIPS_CA + COUNTY_FIPS_SANTA_CLARA
        if not gdf["tract_geoid_2020"].str.startswith(expected_prefix).all():
            report.add_error("Not all tract GEOIDs carry the Santa Clara County prefix 06085.")
        if gdf["tract_geoid_2020"].duplicated().any():
            report.add_error("Duplicate tract GEOIDs found.")
        if not gdf.geometry.is_valid.all():
            report.add_warning("Some tract geometries are invalid before repair.")
        # Santa Clara County has had 372-380+ tracts in recent decennial
        # cycles; a wildly different count signals a filtering bug.
        if not (300 <= len(gdf) <= 500):
            report.add_warning(
                f"Tract row count {len(gdf)} is outside the expected plausible range "
                "for Santa Clara County -- verify the county filter."
            )
        return report
