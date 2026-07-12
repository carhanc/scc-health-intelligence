"""Cross-source geography harmonization: turns independently-staged source
layers into the final canonical geo.* curated tables.

Responsibilities (PLAN.md §4-5, docs/03_ANALYTICS_METHODS.md §2):
- spatially filter places/ZCTAs to those actually touching Santa Clara
  County (the source layers are statewide/national);
- assign each tract to a supervisor district using a documented,
  majority-area-overlap method, with explicit boundary-crossing disclosure;
- never silently drop a boundary-crossing geography -- record the overlap
  fractions instead.

All area computations use a California-appropriate equal-area projected CRS
(EPSG:3310), not raw WGS84 degrees, per docs/02_DATA_SOURCE_REGISTRY.md §4.3.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import geopandas as gpd
import pandas as pd

from scc_health_pipeline.geography.constants import (
    CRS_CALIFORNIA_ALBERS,
    CRS_WEB_WGS84,
)

# A tract is considered "cleanly" assigned to a district when that district
# holds at least this share of the tract's land area; below this threshold
# the tract is flagged as boundary-crossing and all overlapping districts
# (with their shares) are recorded, not just the majority one.
CLEAN_ASSIGNMENT_THRESHOLD = 0.95


@dataclass
class HarmonizeResult:
    curated_paths: dict[str, Path] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    tract_count: int = 0
    place_count: int = 0
    zcta_count: int = 0
    boundary_crossing_tract_count: int = 0


def _read_staged(staged_root: Path, source_id: str, filename: str) -> gpd.GeoDataFrame:
    path = staged_root / source_id / filename
    if not path.exists():
        raise FileNotFoundError(
            f"Expected staged file not found: {path}. Run the corresponding "
            "source adapter's fetch/normalize step first."
        )
    return gpd.read_parquet(path)


def harmonize_geography(staged_root: Path, curated_root: Path) -> HarmonizeResult:
    result = HarmonizeResult()
    curated_root.mkdir(parents=True, exist_ok=True)

    tracts = _read_staged(staged_root, "tiger_tract_2020", "tracts.parquet")
    county = _read_staged(staged_root, "census_county_cartographic_2020", "county.parquet")
    places_ca = _read_staged(staged_root, "tiger_place_2020", "places_california.parquet")
    zctas_coarse = _read_staged(
        staged_root, "census_zcta_cartographic_2020", "zctas_ca_coarse.parquet"
    )
    districts = _read_staged(
        staged_root, "scc_supervisor_districts_2025", "supervisor_districts.parquet"
    )

    result.tract_count = len(tracts)

    # --- Places: spatial-filter statewide layer to those intersecting the
    # county boundary (a place can straddle a county line; we keep it and
    # note that its geometry as stored is the full place, not clipped). ---
    county_geom = county.union_all()
    places_touching = places_ca[places_ca.intersects(county_geom)].copy()
    places_touching["intersects_santa_clara_county"] = True
    result.place_count = len(places_touching)
    places_path = curated_root / "places.parquet"
    places_touching.to_parquet(places_path)
    result.curated_paths["places"] = places_path

    # --- ZCTAs: spatial-filter the coarse-prefiltered national layer to
    # those actually intersecting the county, and record whether each ZCTA
    # is fully or only partially within the county (never implied to be
    # identical to a ZIP code -- docs/02 §3). ---
    zctas_touching = zctas_coarse[zctas_coarse.intersects(county_geom)].copy()
    zctas_albers = zctas_touching.to_crs(CRS_CALIFORNIA_ALBERS)
    county_albers = county.to_crs(CRS_CALIFORNIA_ALBERS)
    county_geom_albers = county_albers.union_all()
    zctas_albers["area_in_county_sqm"] = zctas_albers.geometry.apply(
        lambda geom: geom.intersection(county_geom_albers).area
    )
    zctas_albers["fraction_in_county"] = (
        zctas_albers["area_in_county_sqm"] / zctas_albers.geometry.area
    )
    zctas_touching = zctas_touching.merge(
        zctas_albers[["zcta_geoid", "fraction_in_county"]], on="zcta_geoid"
    )
    zctas_touching["fully_within_county"] = zctas_touching["fraction_in_county"] >= 0.999
    result.zcta_count = len(zctas_touching)
    zctas_path = curated_root / "zctas.parquet"
    zctas_touching.to_parquet(zctas_path)
    result.curated_paths["zctas"] = zctas_path

    # --- Tract-to-district assignment: majority land-area overlap, with
    # explicit boundary-crossing disclosure for anything below the clean
    # threshold (docs/07_BUILD_PHASES.md Phase 2 requirement). ---
    tracts_albers = tracts.to_crs(CRS_CALIFORNIA_ALBERS)
    districts_albers = districts.to_crs(CRS_CALIFORNIA_ALBERS)

    overlap_rows: list[dict[str, object]] = []
    for _, tract_row in tracts_albers.iterrows():
        tract_geom = tract_row.geometry
        tract_area = tract_geom.area
        if tract_area == 0:
            result.warnings.append(
                f"Tract {tract_row['tract_geoid_2020']} has zero area; "
                "skipping district assignment."
            )
            continue
        shares: list[tuple[int, float]] = []
        for _, dist_row in districts_albers.iterrows():
            intersection_area = tract_geom.intersection(dist_row.geometry).area
            if intersection_area > 0:
                shares.append((int(dist_row["district_number"]), intersection_area / tract_area))
        if not shares:
            result.warnings.append(
                f"Tract {tract_row['tract_geoid_2020']} does not intersect any supervisor "
                "district -- likely a coastline/edge geometry artifact; left unassigned."
            )
            continue
        shares.sort(key=lambda s: s[1], reverse=True)
        primary_district, primary_share = shares[0]
        is_clean = primary_share >= CLEAN_ASSIGNMENT_THRESHOLD
        if not is_clean:
            result.boundary_crossing_tract_count += 1
        overlap_rows.append(
            {
                "tract_geoid_2020": tract_row["tract_geoid_2020"],
                "supervisor_district": primary_district,
                "primary_district_share": round(primary_share, 6),
                "is_clean_assignment": is_clean,
                "all_district_shares": ";".join(f"{d}:{round(s, 4)}" for d, s in shares),
            }
        )

    assignment = pd.DataFrame(overlap_rows)
    assignment_path = curated_root / "tract_supervisor_district_assignment.parquet"
    assignment.to_parquet(assignment_path)
    result.curated_paths["tract_supervisor_district_assignment"] = assignment_path

    # --- Final tracts / county / districts pass-through (already canonical
    # from their own adapters; re-written here so all curated geography
    # tables live in one place with a consistent CRS). ---
    tracts_out = tracts.to_crs(CRS_WEB_WGS84)
    tracts_path = curated_root / "tracts.parquet"
    tracts_out.to_parquet(tracts_path)
    result.curated_paths["tracts"] = tracts_path

    county_path = curated_root / "county.parquet"
    county.to_crs(CRS_WEB_WGS84).to_parquet(county_path)
    result.curated_paths["county"] = county_path

    districts_path = curated_root / "supervisor_districts.parquet"
    districts.to_crs(CRS_WEB_WGS84).to_parquet(districts_path)
    result.curated_paths["supervisor_districts"] = districts_path

    return result
