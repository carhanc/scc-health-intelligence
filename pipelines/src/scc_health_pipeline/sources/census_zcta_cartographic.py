"""Census cartographic (1:500,000) ZCTA boundaries, coarse-filtered to
94xxx/95xxx ZCTAs (all Santa Clara County ZIP codes fall in this range) as a
performance optimization on the ~33,000-row national file. The precise
"does this ZCTA actually touch Santa Clara County" determination is made in
the geography harmonization step (spatial intersection with the county
boundary), not here -- this coarse filter only avoids carrying ZCTAs from
the rest of the country through the pipeline.

Verified 2026-07-11 -- docs/data/source-verification.md §3, DECISIONS.md
DEC-013 (cartographic boundary chosen over the raw national TIGER/Line file).
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

_URL = "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip"

# All confirmed Santa Clara County ZIP codes fall in these two prefixes
# (San Jose/Milpitas/Santa Clara/Cupertino 95xxx; Palo Alto/Mountain
# View/Sunnyvale/Los Altos 94xxx). This is a coarse pre-filter only --
# see module docstring.
_COARSE_ZCTA_PREFIXES = ("94", "95")


class CensusZctaCartographicAdapter(TigerZipAdapterMixin):
    source_id = "census_zcta_cartographic_2020"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="cb_2020_us_zcta520_500k",
                url=_URL,
                expected_content_type="application/zip",
                description="National 1:500,000 cartographic ZCTA boundaries.",
            )
        ]

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        gdf = read_shapefile_from_zip(artifact.local_path)
        gdf["zcta_geoid"] = gdf["GEOID20"].astype(str)
        gdf = gdf[gdf["zcta_geoid"].str.startswith(_COARSE_ZCTA_PREFIXES)].copy()
        gdf = gdf.to_crs(CRS_WEB_WGS84)
        # Note: the cartographic (generalized) boundary file does not include
        # internal-point lat/lon fields (those are only in the raw TIGER/Line
        # ZCTA file) -- confirmed against the live schema during Phase 2.
        out = gdf[["zcta_geoid", "ALAND20", "AWATER20", "geometry"]].rename(
            columns={
                "ALAND20": "area_land_sqm",
                "AWATER20": "area_water_sqm",
            }
        )
        out["geometry_precision"] = "cartographic_500k"
        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        out_path = staged_dir / "zctas_ca_coarse.parquet"
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
            report.add_error("Normalized ZCTA table is empty.")
            return report
        if gdf["zcta_geoid"].duplicated().any():
            report.add_error("Duplicate ZCTA GEOIDs found.")
        if not gdf.geometry.is_valid.all():
            report.add_warning("Some ZCTA geometries are invalid before repair.")
        return report
