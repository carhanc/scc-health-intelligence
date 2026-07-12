#!/usr/bin/env python3
"""Generate small, real (not fabricated) offline test fixtures from the raw
data already cached in data/raw/ by a live `make data` run.

Each fixture is a tiny genuine subset of real official data (a handful of
rows), not synthetic/invented records, so contract tests exercise the real
schema and real edge cases (e.g. the blank-ZCTA rows in the relationship
file) without requiring network access in CI.

Run once after `make data` has populated data/raw/; commit the resulting
fixture files in pipelines/fixtures/.
"""

from __future__ import annotations

import zipfile
from pathlib import Path

import geopandas as gpd
import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / "data" / "raw"
FIXTURES_DIR = REPO_ROOT / "pipelines" / "fixtures"


def _write_shapefile_zip(gdf: gpd.GeoDataFrame, out_zip: Path) -> None:
    out_zip.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = out_zip.parent / f"_tmp_{out_zip.stem}"
    tmp_dir.mkdir(exist_ok=True)
    shp_path = tmp_dir / f"{out_zip.stem}.shp"
    gdf.to_file(shp_path)
    if out_zip.exists():
        out_zip.unlink()
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in tmp_dir.glob(f"{out_zip.stem}.*"):
            zf.write(f, arcname=f.name)
    for f in tmp_dir.glob("*"):
        f.unlink()
    tmp_dir.rmdir()


def make_tract_fixture() -> None:
    gdf = gpd.read_file(f"zip://{RAW_DIR / 'tl_2020_06_tract.zip'}")
    sample = gdf[gdf["COUNTYFP"] == "085"].head(4).copy()
    # Include one non-Santa-Clara row too, so the contract test exercises
    # the county filter itself, not just already-filtered data.
    other = gdf[gdf["COUNTYFP"] != "085"].head(1)
    sample = gpd.GeoDataFrame(pl_concat_gdf(sample, other), crs=gdf.crs)
    _write_shapefile_zip(sample, FIXTURES_DIR / "tl_2020_06_tract_sample.zip")
    print(f"tract fixture: {len(sample)} rows")


def pl_concat_gdf(a: gpd.GeoDataFrame, b: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    import pandas as pd

    return pd.concat([a, b], ignore_index=True)


def make_place_fixture() -> None:
    gdf = gpd.read_file(f"zip://{RAW_DIR / 'tl_2020_06_place.zip'}")
    # San Jose plus a few neighbors, chosen for genuine county-boundary coverage.
    sample = gdf.head(6).copy()
    _write_shapefile_zip(sample, FIXTURES_DIR / "tl_2020_06_place_sample.zip")
    print(f"place fixture: {len(sample)} rows")


def make_county_fixture() -> None:
    gdf = gpd.read_file(f"zip://{RAW_DIR / 'cb_2020_us_county_500k.zip'}")
    santa_clara = gdf[gdf["GEOID"] == "06085"]
    neighbor = gdf[gdf["GEOID"] == "06001"]  # Alameda County, for filter testing
    sample = gpd.GeoDataFrame(pl_concat_gdf(santa_clara, neighbor), crs=gdf.crs)
    _write_shapefile_zip(sample, FIXTURES_DIR / "cb_2020_us_county_500k_sample.zip")
    print(f"county fixture: {len(sample)} rows")


def make_zcta_fixture() -> None:
    gdf = gpd.read_file(f"zip://{RAW_DIR / 'cb_2020_us_zcta520_500k.zip'}")
    sc_zctas = gdf[gdf["GEOID20"].isin(["95110", "95112", "94301"])]
    other = gdf[gdf["GEOID20"] == "10001"]  # NYC ZCTA, for prefix-filter testing
    sample = gpd.GeoDataFrame(pl_concat_gdf(sc_zctas, other), crs=gdf.crs)
    _write_shapefile_zip(sample, FIXTURES_DIR / "cb_2020_us_zcta520_500k_sample.zip")
    print(f"zcta fixture: {len(sample)} rows")


def make_supervisor_districts_fixture() -> None:
    src = RAW_DIR / "planning_office_supervisorial_districts.geojson"
    gdf = gpd.read_file(src)
    # Simplify geometry for a lightweight test fixture only -- the real
    # adapter always fetches full-precision data from the live service.
    gdf["geometry"] = gdf["geometry"].simplify(0.001, preserve_topology=True)
    dest = FIXTURES_DIR / "supervisor_districts_sample.geojson"
    if dest.exists():
        dest.unlink()
    gdf.to_file(dest, driver="GeoJSON")
    print(f"supervisor districts fixture: {len(gdf)} rows, simplified geometry")


def make_relationship_fixture() -> None:
    df = pl.read_csv(
        RAW_DIR / "tab20_zcta520_tract20_natl.txt",
        separator="|",
        infer_schema_length=0,
        encoding="utf8-lossy",
    )
    scc_with_zcta = df.filter(
        (pl.col("GEOID_TRACT_20").str.slice(0, 5) == "06085")
        & (pl.col("GEOID_ZCTA5_20").is_not_null())
        & (pl.col("GEOID_ZCTA5_20") != "")
    ).head(8)
    scc_blank_zcta = df.filter(
        (pl.col("GEOID_TRACT_20").str.slice(0, 5) == "06085")
        & ((pl.col("GEOID_ZCTA5_20").is_null()) | (pl.col("GEOID_ZCTA5_20") == ""))
    ).head(2)
    other_county = df.filter(pl.col("GEOID_TRACT_20").str.slice(0, 5) == "06001").head(2)
    sample = pl.concat([scc_with_zcta, scc_blank_zcta, other_county])
    out_path = FIXTURES_DIR / "tab20_zcta520_tract20_natl_sample.txt"
    sample.write_csv(out_path, separator="|")
    print(f"relationship fixture: {len(sample)} rows -> {out_path}")


if __name__ == "__main__":
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    make_tract_fixture()
    make_place_fixture()
    make_county_fixture()
    make_zcta_fixture()
    make_supervisor_districts_fixture()
    make_relationship_fixture()
    print("Done.")
