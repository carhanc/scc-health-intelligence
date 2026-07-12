"""Precomputes the two tract-level metric-input tables that require a
geospatial join rather than a plain SQL column lookup: workforce-shortage
proximity and resource-accessibility distance. Writes them into the
`analytics` warehouse schema so the metric registry can treat them exactly
like any other source table (transform: "precomputed"), keeping metric
evaluation uniform.

Both are explicitly straight-line-distance screening methods (DEC-024),
not network travel time -- see routing/straight_line.py's module
docstring. Full network-routing versions are Phase 6 (Access Lab) scope.
"""

from __future__ import annotations

from dataclasses import dataclass

import duckdb
import polars as pl

from scc_health_pipeline.routing.straight_line import METHOD_LABEL, haversine_miles

# HCAI license categories treated as general clinical-care access points
# for this screening metric (docs/03 §4.3's first candidate component,
# "travel time to clinical care"). Deliberately excludes long-term-care /
# specialized categories (Hospice, Home Health Agency, Skilled Nursing
# Facility, Congregate Living Health Facility, Acute Psychiatric Hospital,
# Psychiatric Health Facility, Psychology Clinic) that would misrepresent
# general clinical-care accessibility if pooled into one distance figure.
_CLINICAL_CARE_LICENSE_CATEGORIES = {
    "General Acute Care Hospital",
    "Community Clinic",
    "Free Clinic",
    "Surgical Clinic",
    "Chronic Dialysis Clinic",
}

_HPSA_PROXIMITY_RADIUS_MILES = 10.0


@dataclass(frozen=True)
class WorkforceShortageDiagnostics:
    mua_rows_total: int
    mua_rows_matched_to_tract: int
    mua_unmatched_census_tract_raw: list[str]
    hpsa_designated_rows_with_coords: int
    hpsa_rows_excluded_no_coords_or_not_designated: int


def compute_workforce_shortage_inputs(
    conn: duckdb.DuckDBPyConnection,
) -> tuple[pl.DataFrame, WorkforceShortageDiagnostics]:
    """Returns (per-tract table, diagnostics).

    mua_designated: 1 if the tract has at least one currently-Designated
    MUA/P record joined via the source's own `census_tract_raw` field
    (DEC-025 -- a genuine authoritative tract identifier already present
    in HRSA's data, not a distance proxy), else 0.

    hpsa_proximity_score: inverse-distance-weighted sum of HPSA scores
    for "Designated" (active) HPSA records that carry real coordinates
    (facility-anchored HPSA designations only -- area-based HPSA records
    without point geometry are excluded from this tract-level score and
    remain visible only in the raw resources.hrsa_hpsa table, DEC-026).
    """
    mua_raw = conn.execute(
        """
        SELECT census_tract_raw, status
        FROM resources.hrsa_mua_p
        WHERE census_tract_raw IS NOT NULL AND census_tract_raw != ''
        """
    ).pl()

    tract_codes = conn.execute("SELECT tract_geoid_2020, tract_code FROM geo.tracts").pl()
    mua_raw = mua_raw.with_columns(
        pl.col("census_tract_raw")
        .str.replace(".", "", literal=True)
        .str.pad_start(6, "0")
        .alias("derived_tract_code")
    )
    mua_joined = mua_raw.join(
        tract_codes, left_on="derived_tract_code", right_on="tract_code", how="left"
    )
    matched = mua_joined.filter(pl.col("tract_geoid_2020").is_not_null())
    unmatched = mua_joined.filter(pl.col("tract_geoid_2020").is_null())

    mua_designated = (
        matched.filter(pl.col("status") == "Designated")
        .select("tract_geoid_2020")
        .unique()
        .with_columns(pl.lit(1).alias("mua_designated"))
    )

    hpsa_points = conn.execute(
        """
        SELECT hpsa_name, hpsa_score, longitude, latitude
        FROM resources.hrsa_hpsa
        WHERE status = 'Designated' AND longitude IS NOT NULL AND latitude IS NOT NULL
        """
    ).fetchall()
    total_hpsa_rows = conn.execute("SELECT COUNT(*) FROM resources.hrsa_hpsa").fetchone()
    n_total_hpsa = total_hpsa_rows[0] if total_hpsa_rows else 0

    tracts = conn.execute(
        "SELECT tract_geoid_2020, internal_point_lat, internal_point_lon FROM geo.tracts"
    ).fetchall()

    proximity_rows = []
    for tract_geoid, lat_str, lon_str in tracts:
        lat, lon = float(lat_str), float(lon_str)
        score = 0.0
        for _name, hpsa_score, hpsa_lon, hpsa_lat in hpsa_points:
            dist = haversine_miles(lat, lon, hpsa_lat, hpsa_lon)
            if dist <= _HPSA_PROXIMITY_RADIUS_MILES and hpsa_score is not None:
                score += float(hpsa_score) / (1.0 + dist)
        proximity_rows.append({"tract_geoid_2020": tract_geoid, "hpsa_proximity_score": score})
    hpsa_proximity = pl.DataFrame(proximity_rows)

    result = (
        tract_codes.select("tract_geoid_2020")
        .join(mua_designated, on="tract_geoid_2020", how="left")
        .join(hpsa_proximity, on="tract_geoid_2020", how="left")
        .with_columns(pl.col("mua_designated").fill_null(0))
        .with_columns(pl.lit(METHOD_LABEL).alias("method"))
    )

    diagnostics = WorkforceShortageDiagnostics(
        mua_rows_total=mua_raw.height,
        mua_rows_matched_to_tract=matched.height,
        mua_unmatched_census_tract_raw=unmatched["census_tract_raw"].to_list(),
        hpsa_designated_rows_with_coords=len(hpsa_points),
        hpsa_rows_excluded_no_coords_or_not_designated=n_total_hpsa - len(hpsa_points),
    )
    return result, diagnostics


@dataclass(frozen=True)
class ResourceAccessibilityDiagnostics:
    n_candidate_sites: int
    n_hcai_clinical_sites: int
    n_hrsa_sites: int


def compute_resource_accessibility_inputs(
    conn: duckdb.DuckDBPyConnection,
) -> tuple[pl.DataFrame, ResourceAccessibilityDiagnostics]:
    """nearest_clinical_care_distance_miles: straight-line distance from
    each tract's internal point to the nearest clinical-care candidate
    site (HCAI general/community/free/surgical/dialysis clinics union
    HRSA health center sites). Facility deduplication across the two
    source tables is explicitly deferred to Phase 6 (DATA_DICTIONARY.md
    "Not yet implemented") -- a small number of near-duplicate sites
    across the two tables may both count as separate candidates here."""
    hcai_categories = ", ".join(f"'{c}'" for c in _CLINICAL_CARE_LICENSE_CATEGORIES)
    hcai_sites = conn.execute(
        f"""
        SELECT oshpd_id AS site_id, latitude, longitude
        FROM resources.hcai_facilities
        WHERE license_category_desc IN ({hcai_categories})
          AND facility_status_desc = 'Open'
        """
    ).fetchall()
    hrsa_sites = conn.execute(
        """
        SELECT health_center_number || '-' || site_name AS site_id, latitude, longitude
        FROM resources.hrsa_health_center_sites
        WHERE operating_status = 'Active'
        """
    ).fetchall()
    candidates = [(sid, lat, lon) for sid, lat, lon in hcai_sites + hrsa_sites]

    tracts = conn.execute(
        "SELECT tract_geoid_2020, internal_point_lat, internal_point_lon FROM geo.tracts"
    ).fetchall()

    rows = []
    for tract_geoid, lat_str, lon_str in tracts:
        lat, lon = float(lat_str), float(lon_str)
        if candidates:
            best = min(
                candidates, key=lambda c: haversine_miles(lat, lon, float(c[1]), float(c[2]))
            )
            dist = haversine_miles(lat, lon, float(best[1]), float(best[2]))
        else:
            dist = None
        rows.append({"tract_geoid_2020": tract_geoid, "nearest_clinical_care_distance_miles": dist})

    result = pl.DataFrame(rows).with_columns(pl.lit(METHOD_LABEL).alias("method"))
    diagnostics = ResourceAccessibilityDiagnostics(
        n_candidate_sites=len(candidates),
        n_hcai_clinical_sites=len(hcai_sites),
        n_hrsa_sites=len(hrsa_sites),
    )
    return result, diagnostics
