"""Shared base for Census TIGER/Line and cartographic-boundary zip adapters.

All four boundary adapters (tract, place, county, ZCTA) download a single
zipped Shapefile and share the same fetch/validate_raw logic; only the
source URL, GEOID field, and county-filter logic differ per adapter.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import geopandas as gpd

from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry


class TigerZipAdapterMixin:
    """Shared fetch/validate_raw for zipped-Shapefile Census sources."""

    source_id: str

    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact:
        return fetch_with_retry(resource, context, source_id=self.source_id)

    def validate_raw(self, artifact: RawArtifact) -> ValidationReport:
        report = ValidationReport()
        if artifact.status == "unavailable":
            report.add_error(f"Fetch failed: {artifact.notes}")
            return report
        if artifact.local_path is None or not artifact.local_path.exists():
            report.add_error("No local file recorded for a non-unavailable artifact.")
            return report
        if (
            artifact.content_type
            and "zip" not in artifact.content_type
            and not str(artifact.local_path).endswith(".zip")
        ):
            report.add_warning(
                f"Unexpected content-type '{artifact.content_type}' for a Shapefile zip."
            )
        if artifact.bytes < 1024:
            report.add_error(
                f"Downloaded file is implausibly small ({artifact.bytes} bytes) for a "
                "Census boundary Shapefile -- likely an error page or truncated download."
            )
        return report


def write_geoparquet(gdf: gpd.GeoDataFrame, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(out_path)
    return out_path


def now_iso() -> str:
    return datetime.now(UTC).isoformat()
