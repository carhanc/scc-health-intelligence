"""Santa Clara County Board of Supervisors district boundaries.

Verified 2026-07-11 -- docs/data/source-verification.md and DECISIONS.md
DEC-012: uses the labeled `PlanningOfficeDataService2` layer 5 (explicit
DISTRICT + SUPERVISOR fields), not the geometry-only 2021 layer that has no
way to verify which OBJECTID maps to which official district number.
"""

from __future__ import annotations

from pathlib import Path

from scc_health_pipeline.geography.constants import CRS_WEB_WGS84
from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry
from scc_health_pipeline.sources.tiger_base import write_geoparquet

ADAPTER_VERSION = "1.0.0"

_QUERY_URL = (
    "https://services2.arcgis.com/tcv2cMrq63AgvbHF/arcgis/rest/services/"
    "PlanningOfficeDataService2/FeatureServer/5/query"
    "?where=1%3D1&outFields=*&outSR=4326&f=geojson"
)

_EXPECTED_DISTRICTS = {1, 2, 3, 4, 5}


class SccSupervisorDistrictsAdapter:
    source_id = "scc_supervisor_districts_2025"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="planning_office_supervisorial_districts",
                url=_QUERY_URL,
                expected_content_type="application/json",
                description=(
                    "Santa Clara County Board of Supervisors district boundaries "
                    "with explicit DISTRICT/SUPERVISOR fields (SCC.Planning.Office, "
                    "PlanningOfficeDataService2 layer 5)."
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
                f"Response implausibly small ({artifact.bytes} bytes) for 5 district polygons."
            )
        import json

        try:
            with artifact.local_path.open(encoding="utf-8") as fh:
                payload = json.load(fh)
        except json.JSONDecodeError as exc:
            report.add_error(f"Response is not valid JSON: {exc}")
            return report
        if "error" in payload:
            report.add_error(f"ArcGIS service returned an error: {payload['error']}")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        import geopandas as gpd

        gdf = gpd.read_file(artifact.local_path)
        gdf = gdf.set_crs(CRS_WEB_WGS84, allow_override=True) if gdf.crs is None else gdf.to_crs(
            CRS_WEB_WGS84
        )
        out = gdf[["DISTRICT", "SUPERVISOR", "ACRES", "SQ_MILES", "geometry"]].rename(
            columns={
                "DISTRICT": "district_number",
                "SUPERVISOR": "supervisor_name",
                "ACRES": "area_acres",
                "SQ_MILES": "area_sq_miles",
            }
        )
        out["district_number"] = out["district_number"].astype(int)
        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        out_path = staged_dir / "supervisor_districts.parquet"
        write_geoparquet(out, out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report
        import geopandas as gpd

        gdf = gpd.read_parquet(normalized_paths[0])
        if len(gdf) != 5:
            report.add_error(f"Expected exactly 5 supervisor districts, found {len(gdf)}.")
        found_districts = set(gdf["district_number"].tolist())
        if found_districts != _EXPECTED_DISTRICTS:
            report.add_error(
                f"District numbers {sorted(found_districts)} do not match expected "
                f"{sorted(_EXPECTED_DISTRICTS)}."
            )
        if gdf["supervisor_name"].isna().any() or (gdf["supervisor_name"] == "").any():
            report.add_error("At least one district is missing a supervisor name.")
        if not gdf.geometry.is_valid.all():
            report.add_warning("Some district geometries are invalid before repair.")
        return report
