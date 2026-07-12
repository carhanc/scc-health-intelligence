"""Hand-calculated tests for metrics/precomputed_geospatial.py against a
small synthetic in-memory DuckDB warehouse (not the full live warehouse),
so the join/distance/scoring logic itself is verified precisely."""

from __future__ import annotations

import duckdb
import pytest
from scc_health_pipeline.metrics.precomputed_geospatial import (
    compute_resource_accessibility_inputs,
    compute_workforce_shortage_inputs,
)
from scc_health_pipeline.routing.straight_line import haversine_miles


@pytest.fixture
def conn() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect(":memory:")
    c.execute(
        """
        CREATE SCHEMA geo;
        CREATE TABLE geo.tracts (
            tract_geoid_2020 VARCHAR, tract_code VARCHAR,
            internal_point_lat VARCHAR, internal_point_lon VARCHAR
        );
        INSERT INTO geo.tracts VALUES
            ('06085500100', '500100', '+37.3000000', '-121.9000000'),
            ('06085500200', '500200', '+37.4000000', '-121.9500000');

        CREATE SCHEMA resources;
        CREATE TABLE resources.hrsa_mua_p (
            census_tract_raw VARCHAR, status VARCHAR
        );
        -- '5001.00' -> derived tract_code '500100' -> matches tract 1.
        -- '9999.99' -> derived '999999' -> matches nothing (unmatched).
        INSERT INTO resources.hrsa_mua_p VALUES
            ('5001.00', 'Designated'),
            ('9999.99', 'Designated');

        CREATE TABLE resources.hrsa_hpsa (
            hpsa_name VARCHAR, hpsa_score DOUBLE, status VARCHAR,
            longitude DOUBLE, latitude DOUBLE
        );
        -- One Designated HPSA point very close to tract 1, one far from both.
        INSERT INTO resources.hrsa_hpsa VALUES
            ('Near Clinic HPSA', 10.0, 'Designated', -121.9001, 37.3001),
            ('Withdrawn HPSA', 20.0, 'Withdrawn', -121.9001, 37.3001),
            ('Far HPSA', 5.0, 'Designated', -123.5, 39.0);

        CREATE TABLE resources.hcai_facilities (
            oshpd_id VARCHAR, latitude DOUBLE, longitude DOUBLE,
            license_category_desc VARCHAR, facility_status_desc VARCHAR
        );
        INSERT INTO resources.hcai_facilities VALUES
            ('F1', 37.3001, -121.9001, 'Community Clinic', 'Open'),
            ('F2', 37.3001, -121.9001, 'Skilled Nursing Facility', 'Open');

        CREATE TABLE resources.hrsa_health_center_sites (
            health_center_number VARCHAR, site_name VARCHAR,
            latitude DOUBLE, longitude DOUBLE, operating_status VARCHAR
        );
        INSERT INTO resources.hrsa_health_center_sites VALUES
            ('H1', 'Site A', 37.4001, -121.9501, 'Active');
        """
    )
    return c


def test_mua_designated_flag_uses_direct_tract_code_join(
    conn: duckdb.DuckDBPyConnection,
) -> None:
    result, diagnostics = compute_workforce_shortage_inputs(conn)
    row1 = result.filter(result["tract_geoid_2020"] == "06085500100")
    row2 = result.filter(result["tract_geoid_2020"] == "06085500200")
    assert row1["mua_designated"][0] == 1
    assert row2["mua_designated"][0] == 0
    assert diagnostics.mua_rows_matched_to_tract == 1
    assert diagnostics.mua_unmatched_census_tract_raw == ["9999.99"]


def test_hpsa_proximity_score_excludes_non_designated_and_out_of_range(
    conn: duckdb.DuckDBPyConnection,
) -> None:
    result, diagnostics = compute_workforce_shortage_inputs(conn)
    row1 = result.filter(result["tract_geoid_2020"] == "06085500100")
    # Only "Near Clinic HPSA" (Designated, close) should contribute;
    # "Withdrawn HPSA" is excluded by status, "Far HPSA" is >10mi away.
    dist = haversine_miles(37.3000000, -121.9000000, 37.3001, -121.9001)
    expected = 10.0 / (1.0 + dist)
    assert row1["hpsa_proximity_score"][0] == pytest.approx(expected, rel=1e-6)
    assert diagnostics.hpsa_designated_rows_with_coords == 2  # Near + Far


def test_resource_accessibility_nearest_distance_hand_calculated(
    conn: duckdb.DuckDBPyConnection,
) -> None:
    result, diagnostics = compute_resource_accessibility_inputs(conn)
    # Tract 1 (37.30, -121.90) is closest to F1 (Community Clinic, Open);
    # F2 (Skilled Nursing Facility) is correctly excluded by category.
    row1 = result.filter(result["tract_geoid_2020"] == "06085500100")
    expected = haversine_miles(37.3000000, -121.9000000, 37.3001, -121.9001)
    assert row1["nearest_clinical_care_distance_miles"][0] == pytest.approx(expected, rel=1e-6)
    # Only F1 (Community Clinic) + H1 (HRSA) count as candidates -- F2
    # (Skilled Nursing Facility) is excluded by license category.
    assert diagnostics.n_candidate_sites == 2
    assert diagnostics.n_hcai_clinical_sites == 1
    assert diagnostics.n_hrsa_sites == 1


def test_resource_accessibility_tract_2_nearest_is_hrsa_site(
    conn: duckdb.DuckDBPyConnection,
) -> None:
    result, _ = compute_resource_accessibility_inputs(conn)
    row2 = result.filter(result["tract_geoid_2020"] == "06085500200")
    # Tract 2 (37.40, -121.95) is a hair from H1 (37.4001, -121.9501) --
    # the only candidate anywhere near it (F1/F2 are ~11mi away near tract 1).
    expected = haversine_miles(37.4000000, -121.9500000, 37.4001, -121.9501)
    assert row2["nearest_clinical_care_distance_miles"][0] == pytest.approx(expected, rel=1e-6)
