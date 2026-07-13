"""Santa Clara County Public Health Department's "Health clinics" point
layer -- one of the few real, verified, currently-reachable facility
inventories found on the County's ArcGIS Hub open-data catalogs during
Phase 6 discovery (DEC-045). Supplemental to (not a replacement for)
HCAI's licensed-facility data and HRSA's health-center-site data; real
overlap with both is expected (many of these are FQHCs also licensed by
HCAI and listed by HRSA), which is exactly the case the Phase 6
deduplication pipeline exists to catch.

The County's own directly-hosted GIS REST services (sccgov.org/gis/...)
return HTTP 403 to automated fetches; this layer is instead served through
the separate Public Health ArcGIS Hub catalog (data-sccphd.opendata.arcgis.com),
which does not 403.
"""

from __future__ import annotations

import json
from pathlib import Path

import polars as pl

from scc_health_pipeline.sources.arcgis import build_geojson_query_url
from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry

ADAPTER_VERSION = "1.0.0"

_FEATURE_SERVER = "https://services2.arcgis.com/RiZWfy7B1r76pKTz/arcgis/rest/services/Health_clinics/FeatureServer"
_QUERY_URL = build_geojson_query_url(_FEATURE_SERVER, layer_id=0)

_LAT_MIN, _LAT_MAX = 36.7, 37.7
_LON_MIN, _LON_MAX = -122.3, -121.0


class SccHealthClinicsAdapter:
    source_id = "scc_health_clinics"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="scc_public_health_clinics",
                url=_QUERY_URL,
                expected_content_type="application/json",
                description=(
                    "Santa Clara County Public Health Department health-clinic point "
                    "locations (ArcGIS Hub, layer HealthCliniclocations_Export)."
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
        if artifact.bytes < 1_000:
            report.add_error(f"SCC health clinics file implausibly small ({artifact.bytes} bytes).")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        raw = json.loads(artifact.local_path.read_text())
        features = raw.get("features", [])

        rows = []
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry")
            if not geom or geom.get("type") != "Point":
                continue
            lon, lat = geom["coordinates"][0], geom["coordinates"][1]
            rows.append(
                {
                    "source_object_id": str(props.get("OBJECTID", "")),
                    "center_name": props.get("USER_H_CenterName", ""),
                    "operated_by": props.get("USER_OperatedBy", ""),
                    "match_status": props.get("Status", ""),
                    "matched_address": props.get("Match_addr", ""),
                    "latitude": lat,
                    "longitude": lon,
                }
            )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "health_clinics.parquet"
        pl.DataFrame(rows).write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("SCC health clinics table is empty.")
            return report

        missing_name = df.filter(
            pl.col("center_name").is_null() | (pl.col("center_name") == "")
        )
        if missing_name.height > 0:
            report.add_error(f"{missing_name.height} clinic(s) have no center name.")

        out_of_bounds = df.filter(
            (pl.col("latitude") < _LAT_MIN)
            | (pl.col("latitude") > _LAT_MAX)
            | (pl.col("longitude") < _LON_MIN)
            | (pl.col("longitude") > _LON_MAX)
        )
        if out_of_bounds.height > 0:
            report.add_error(
                f"{out_of_bounds.height} clinic(s) fall outside the plausible county bounding box."
            )

        if df.height < 20:
            report.add_warning(
                f"Only {df.height} clinics found; expected roughly 90-110 based on live "
                "verification. Re-verify if this drifts further."
            )

        return report
