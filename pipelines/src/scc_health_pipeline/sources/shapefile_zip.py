"""Helper for reading Census-style zipped Shapefiles into GeoDataFrames."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd


def read_shapefile_from_zip(zip_path: Path) -> gpd.GeoDataFrame:
    """Read the single .shp layer inside a Census TIGER/Line-style zip.

    Uses GeoPandas' zip:// / vsizip handling via the `zip+file://` URI so no
    manual extraction to a temp directory is needed, and the immutable raw
    zip in data/raw is never modified.
    """
    return gpd.read_file(f"zip://{zip_path}")
