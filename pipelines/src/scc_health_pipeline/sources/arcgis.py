"""Shared ArcGIS FeatureServer/MapServer REST query helper.

Used by any adapter pulling from an Esri-hosted feature service (Santa
Clara County GIS Hub layers, supervisor districts, etc.). Builds a GeoJSON
query URL; the caller is responsible for fetching it via
sources.http_fetch.fetch_with_retry so retry/manifest behavior stays
consistent across adapters.
"""

from __future__ import annotations

from urllib.parse import urlencode


def build_geojson_query_url(
    feature_server_url: str,
    layer_id: int,
    *,
    where: str = "1=1",
    out_fields: str = "*",
    out_sr: int = 4326,
) -> str:
    """Build a GeoJSON query URL for an ArcGIS FeatureServer/MapServer layer.

    Example: build_geojson_query_url(
        "https://services2.arcgis.com/.../FeatureServer", 5
    ) -> ".../FeatureServer/5/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
    """
    base = feature_server_url.rstrip("/")
    params = {
        "where": where,
        "outFields": out_fields,
        "outSR": str(out_sr),
        "f": "geojson",
    }
    return f"{base}/{layer_id}/query?{urlencode(params)}"


def build_item_search_url(query: str, num: int = 10) -> str:
    """Build an ArcGIS Online item-search URL (for discovery/verification
    of a feature service before pinning its URL in an adapter)."""
    params = {"q": query, "f": "json", "num": str(num)}
    return f"https://www.arcgis.com/sharing/rest/search?{urlencode(params)}"
