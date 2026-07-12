"""Read-only geography queries against the DuckDB warehouse.

Every function takes an already-open connection (see db.get_read_only_connection)
-- the repository layer never opens its own writable connection, per
docs/04_ARCHITECTURE_IMPLEMENTATION.md §6.
"""

from __future__ import annotations

import json
from typing import Any

import duckdb


def search_geographies(
    conn: duckdb.DuckDBPyConnection, query: str, limit: int = 20
) -> list[dict[str, Any]]:
    """Search tracts (by GEOID or name), places (by name), and supervisor
    districts (by number or supervisor name). Case-insensitive substring
    match -- Phase 5 will add a proper ranked/fuzzy search index."""
    like_query = f"%{query.lower()}%"
    results: list[dict[str, Any]] = []

    tract_rows = conn.execute(
        """
        SELECT tract_geoid_2020, name_long FROM geo.tracts
        WHERE LOWER(tract_geoid_2020) LIKE ? OR LOWER(name_long) LIKE ?
        ORDER BY tract_geoid_2020 LIMIT ?
        """,
        [like_query, like_query, limit],
    ).fetchall()
    results.extend(
        {"geography_type": "tract", "geography_id": r[0], "label": r[1]} for r in tract_rows
    )

    place_rows = conn.execute(
        """
        SELECT place_geoid, name_long FROM geo.places
        WHERE LOWER(name) LIKE ? OR LOWER(name_long) LIKE ?
        ORDER BY name LIMIT ?
        """,
        [like_query, like_query, limit],
    ).fetchall()
    results.extend(
        {"geography_type": "place", "geography_id": r[0], "label": r[1]} for r in place_rows
    )

    district_rows = conn.execute(
        """
        SELECT CAST(district_number AS VARCHAR), supervisor_name FROM geo.supervisor_districts
        WHERE LOWER(supervisor_name) LIKE ? OR LOWER(CAST(district_number AS VARCHAR)) LIKE ?
        ORDER BY district_number LIMIT ?
        """,
        [like_query, like_query, limit],
    ).fetchall()
    results.extend(
        {
            "geography_type": "supervisor_district",
            "geography_id": r[0],
            "label": f"District {r[0]} ({r[1]})",
        }
        for r in district_rows
    )

    return results[:limit]


def get_tract_profile(conn: duckdb.DuckDBPyConnection, tract_geoid: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT t.tract_geoid_2020, t.name, t.name_long, t.county_fips,
               t.area_land_sqm, t.area_water_sqm,
               a.supervisor_district, a.primary_district_share, a.is_clean_assignment
        FROM geo.tracts t
        LEFT JOIN geo.tract_supervisor_district_assignment a
          ON t.tract_geoid_2020 = a.tract_geoid_2020
        WHERE t.tract_geoid_2020 = ?
        """,
        [tract_geoid],
    ).fetchone()
    if row is None:
        return None
    return {
        "tract_geoid_2020": row[0],
        "name": row[1],
        "name_long": row[2],
        "county_fips": row[3],
        "area_land_sqm": row[4],
        "area_water_sqm": row[5],
        "supervisor_district": row[6],
        "supervisor_district_share": row[7],
        "supervisor_district_is_clean_assignment": row[8],
    }


def get_place_profile(conn: duckdb.DuckDBPyConnection, place_geoid: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT place_geoid, name, name_long, area_land_sqm, area_water_sqm "
        "FROM geo.places WHERE place_geoid = ?",
        [place_geoid],
    ).fetchone()
    if row is None:
        return None
    return {
        "place_geoid": row[0],
        "name": row[1],
        "name_long": row[2],
        "area_land_sqm": row[3],
        "area_water_sqm": row[4],
    }


def get_supervisor_district_profile(
    conn: duckdb.DuckDBPyConnection, district_number: int
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT district_number, supervisor_name, area_sq_miles "
        "FROM geo.supervisor_districts WHERE district_number = ?",
        [district_number],
    ).fetchone()
    if row is None:
        return None
    count_row = conn.execute(
        "SELECT COUNT(*) FROM geo.tract_supervisor_district_assignment "
        "WHERE supervisor_district = ?",
        [district_number],
    ).fetchone()
    tract_count = count_row[0] if count_row is not None else 0
    return {
        "district_number": row[0],
        "supervisor_name": row[1],
        "area_sq_miles": row[2],
        "tract_count": tract_count,
    }


_BOUNDARY_TABLES: dict[str, tuple[str, str]] = {
    "tract": ("geo.tracts", "tract_geoid_2020"),
    "place": ("geo.places", "place_geoid"),
    "zcta": ("geo.zctas", "zcta_geoid"),
    "county": ("geo.county", "county_geoid"),
    "supervisor_district": ("geo.supervisor_districts", "CAST(district_number AS VARCHAR)"),
}


def get_geography_boundary(
    conn: duckdb.DuckDBPyConnection, geography_type: str, geography_id: str
) -> dict[str, Any] | None:
    if geography_type not in _BOUNDARY_TABLES:
        return None
    table, id_expr = _BOUNDARY_TABLES[geography_type]
    row = conn.execute(
        f"SELECT ST_AsGeoJSON(geometry) FROM {table} WHERE {id_expr} = ?",
        [geography_id],
    ).fetchone()
    if row is None or row[0] is None:
        return None
    geometry: dict[str, Any] = json.loads(row[0])
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": {"geography_type": geography_type, "geography_id": geography_id},
    }
