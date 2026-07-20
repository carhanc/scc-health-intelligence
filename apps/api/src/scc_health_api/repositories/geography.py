"""Read-only geography queries against the DuckDB warehouse.

Every function takes an already-open connection (see db.get_read_only_connection)
-- the repository layer never opens its own writable connection, per
docs/04_ARCHITECTURE_IMPLEMENTATION.md §6.
"""

from __future__ import annotations

import json
import re
from typing import Any

import duckdb

_TRACT_GEOID_RE = re.compile(r"^\d{11}$")

# A tract is "in" a place by the same majority-land-area-overlap method
# already used for the audited, persisted tract-to-supervisor-district
# assignment (geo.tract_supervisor_district_assignment) -- this table,
# geo.tract_place_assignment, is built the same way (Phase 6.5,
# pipelines/src/scc_health_pipeline/geography/harmonize.py) so "which
# city is this tract in" answers consistently across the whole platform,
# rather than one relationship using full-polygon overlap and another
# using looser internal-point containment. Live-verified during Phase 6.5
# build: the two methods disagree for 35 of 408 tracts (the same
# boundary-ambiguous tracts majority-overlap already discloses via
# is_clean_assignment=false), confirming this was a real methodology
# choice, not an inconsequential one.
_TRACT_IN_PLACE_JOIN = """
    JOIN geo.tract_place_assignment tpa ON tpa.tract_geoid_2020 = t.tract_geoid_2020
    JOIN geo.places p ON p.place_geoid = tpa.place_geoid
"""

# A result's geography_type gets this base priority added to its
# match-quality rank before sorting -- lower sorts first. Tracts default
# to the lowest priority (highest number) so a name/city/ZIP search is
# never crowded out by 11-digit tract GEOIDs matching as a loose
# substring; a query that looks like an actual tract GEOID overrides this
# via _type_priority_for_query() below (Phase 6.5, "users should never
# need to know census tract IDs" -- but a tract ID, once known, must
# still work as a search term).
_DEFAULT_TYPE_PRIORITY: dict[str, int] = {
    "place": 0,
    "zcta": 0,
    "supervisor_district": 0,
    "tract": 1,
}


def _type_priority_for_query(query: str) -> dict[str, int]:
    """If the query is unambiguously shaped like a tract GEOID, promote
    tracts to the front -- a user who already has a specific tract number
    (e.g. from a report or a prior search) must not have it buried behind
    unrelated city/ZIP/district matches."""
    if _TRACT_GEOID_RE.match(query):
        return {"place": 1, "zcta": 1, "supervisor_district": 1, "tract": 0}
    return _DEFAULT_TYPE_PRIORITY


def _match_rank(query_lower: str, *candidates: str | None) -> int | None:
    """0 = exact match, 1 = starts-with, 2 = substring, None = no match,
    checked against every candidate string for a row (e.g. both a short
    name and a long name) and returns the best (lowest) rank found."""
    best: int | None = None
    for candidate in candidates:
        if not candidate:
            continue
        candidate_lower = candidate.lower()
        if candidate_lower == query_lower:
            rank = 0
        elif candidate_lower.startswith(query_lower):
            rank = 1
        elif query_lower in candidate_lower:
            rank = 2
        else:
            continue
        if best is None or rank < best:
            best = rank
    return best


def search_geographies(
    conn: duckdb.DuckDBPyConnection, query: str, limit: int = 20
) -> list[dict[str, Any]]:
    """Ranked search across every native geography type a user might
    reasonably type: a city/place name, a ZIP code (ZCTA), a supervisor
    district (number or supervisor name), a neighborhood-shaped name
    match against tract long names, or a raw tract GEOID. Never requires
    a user to already know a tract ID (Phase 6.5) -- tracts remain
    searchable but are deprioritized relative to the other types unless
    the query itself is shaped like a tract GEOID.

    Ranking: exact match first, then starts-with, then substring, each
    tier further ordered by geography-type priority (see
    `_type_priority_for_query`) so, at equal match quality, a city/ZIP/
    district result sorts ahead of a tract. A generous per-type candidate
    pool is the full contents of each geography table (tract 408, place
    30, zcta 70, supervisor_district 5 -- ~513 rows total in the current
    warehouse), fetched unconditionally and ranked/filtered entirely in
    Python. This is deliberate, not merely "small enough to be lazy
    about": an early version filtered candidates via a SQL `LIKE` clause
    before Python-side ranking ran, which meant a query matching only a
    *synthetic* candidate string (e.g. "district 3" against the
    Python-only candidate `f"district {number}"`, never a real column
    value) was silently dropped before ranking ever saw it -- the SQL
    WHERE clause and the Python match-candidate list must never diverge,
    and fetching everything removes that entire class of bug rather than
    requiring the two to be kept in sync by hand.
    """
    query_lower = query.lower().strip()
    if not query_lower:
        return []
    type_priority = _type_priority_for_query(query.strip())

    candidates: list[dict[str, Any]] = []

    tract_rows = conn.execute(
        "SELECT tract_geoid_2020, name, name_long FROM geo.tracts"
    ).fetchall()
    for geoid, name, name_long in tract_rows:
        rank = _match_rank(query_lower, geoid, name, name_long)
        if rank is not None:
            candidates.append(
                {
                    "geography_type": "tract",
                    "geography_id": geoid,
                    "label": name_long,
                    "_rank": rank,
                }
            )

    place_rows = conn.execute("SELECT place_geoid, name, name_long FROM geo.places").fetchall()
    for geoid, name, name_long in place_rows:
        rank = _match_rank(query_lower, name, name_long)
        if rank is not None:
            candidates.append(
                {
                    "geography_type": "place",
                    "geography_id": geoid,
                    "label": name_long,
                    "_rank": rank,
                }
            )

    zcta_rows = conn.execute("SELECT zcta_geoid FROM geo.zctas").fetchall()
    for (geoid,) in zcta_rows:
        rank = _match_rank(query_lower, geoid, f"zip {geoid}", f"zip code {geoid}")
        if rank is not None:
            candidates.append(
                {
                    "geography_type": "zcta",
                    "geography_id": geoid,
                    "label": f"ZIP Code Tabulation Area {geoid}",
                    "_rank": rank,
                }
            )

    district_rows = conn.execute(
        "SELECT CAST(district_number AS VARCHAR), supervisor_name FROM geo.supervisor_districts"
    ).fetchall()
    for number, supervisor_name in district_rows:
        rank = _match_rank(query_lower, number, f"district {number}", supervisor_name)
        if rank is not None:
            candidates.append(
                {
                    "geography_type": "supervisor_district",
                    "geography_id": number,
                    "label": f"District {number} ({supervisor_name})",
                    "_rank": rank,
                }
            )

    candidates.sort(
        key=lambda c: (c["_rank"], type_priority.get(c["geography_type"], 2), c["label"])
    )
    for c in candidates:
        del c["_rank"]
    return candidates[:limit]


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
    tract_count_row = conn.execute(
        f"""
        SELECT COUNT(*) FROM geo.tracts t
        {_TRACT_IN_PLACE_JOIN}
        WHERE p.place_geoid = ?
        """,
        [place_geoid],
    ).fetchone()
    return {
        "place_geoid": row[0],
        "name": row[1],
        "name_long": row[2],
        "area_land_sqm": row[3],
        "area_water_sqm": row[4],
        "tract_count": tract_count_row[0] if tract_count_row else 0,
    }


def get_place_top_concern_tracts(
    conn: duckdb.DuckDBPyConnection, place_geoid: str, scenario_id: str | None, limit: int = 5
) -> list[dict[str, Any]]:
    """The `limit` highest-scoring (highest-concern) tracts assigned to
    this place by majority land-area overlap (Phase 6.5,
    geo.tract_place_assignment) -- the same audited method already used
    for tract-to-supervisor-district assignment.

    Returns an empty list (not fabricated tracts, not zero-scored ones)
    when `scenario_id` is not supplied or `analytics.scenario_scores`
    does not exist -- a city summary with no scenario active has no
    "highest concern" to report yet, and that absence must be visible in
    the UI, not silently guessed at with a default scenario.
    """
    if not scenario_id or not _table_exists(conn, "analytics", "scenario_scores"):
        return []
    rows = conn.execute(
        f"""
        SELECT t.tract_geoid_2020, t.name_long, s.score, s.coverage_fraction
        FROM geo.tracts t
        {_TRACT_IN_PLACE_JOIN}
        JOIN analytics.scenario_scores s
          ON t.tract_geoid_2020 = s.tract_geoid_2020 AND s.scenario_id = ?
        WHERE p.place_geoid = ? AND s.score IS NOT NULL
        ORDER BY s.score DESC
        LIMIT ?
        """,
        [scenario_id, place_geoid, limit],
    ).fetchall()
    return [
        {
            "tract_geoid_2020": r[0],
            "name_long": r[1],
            "score": r[2],
            "coverage_fraction": r[3],
        }
        for r in rows
    ]


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


def get_district_top_concern_tracts(
    conn: duckdb.DuckDBPyConnection, district_number: int, scenario_id: str | None, limit: int = 5
) -> list[dict[str, Any]]:
    """The `limit` highest-scoring tracts assigned to this supervisor
    district by majority land-area overlap (geo.tract_supervisor_district_assignment),
    mirroring `get_place_top_concern_tracts` -- same drill-down pattern,
    same empty-list-not-fabricated behavior when no scenario is active."""
    if not scenario_id or not _table_exists(conn, "analytics", "scenario_scores"):
        return []
    rows = conn.execute(
        """
        SELECT t.tract_geoid_2020, t.name_long, s.score, s.coverage_fraction
        FROM geo.tracts t
        JOIN geo.tract_supervisor_district_assignment a
          ON a.tract_geoid_2020 = t.tract_geoid_2020
        JOIN analytics.scenario_scores s
          ON t.tract_geoid_2020 = s.tract_geoid_2020 AND s.scenario_id = ?
        WHERE a.supervisor_district = ? AND s.score IS NOT NULL
        ORDER BY s.score DESC
        LIMIT ?
        """,
        [scenario_id, district_number, limit],
    ).fetchall()
    return [
        {
            "tract_geoid_2020": r[0],
            "name_long": r[1],
            "score": r[2],
            "coverage_fraction": r[3],
        }
        for r in rows
    ]


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


def _table_exists(conn: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
        [schema, table],
    ).fetchone()
    return bool(row and row[0] > 0)


# The 5 domains scored by every scenario (config/scenarios.yml). Listed
# explicitly rather than discovered dynamically -- matches this module's
# existing plain-SQL style (no dynamic pivot) and lets a schema-typo bug
# in a domain name fail loudly (an unknown column) rather than silently
# produce an empty layer.
_DOMAIN_NAMES = (
    "health_burden",
    "access_barriers",
    "environmental_burden",
    "resource_accessibility",
    "workforce_shortage",
)


def get_all_tract_boundaries_with_scores(
    conn: duckdb.DuckDBPyConnection, scenario_id: str | None
) -> list[dict[str, Any]]:
    """Bulk tract geometry for the Explore map choropleth (DEC-038). Every
    tract is always returned with its identity + geometry; score fields
    are only joined in when a scenario_id is supplied and analytics
    tables exist (never fabricated, never zero -- absent means "no
    scoring data for this tract/scenario," not "zero concern").

    Also joins each tract's 5 domain scores from analytics.domain_scores
    (DEC-073) -- unlike the composite score, domain scores carry no
    scenario_id (verified directly against the warehouse: the table has
    no scenario_id column, since a domain's percentile-scale score
    doesn't depend on how domains are weighted against each other). This
    powers the Explore map's per-domain layer switcher without any new
    pipeline computation -- the table already exists and is already
    populated by every `make data` run."""
    has_scores = bool(scenario_id) and _table_exists(conn, "analytics", "scenario_scores")
    has_stability = bool(scenario_id) and _table_exists(conn, "analytics", "stability_labels")
    has_domain_scores = _table_exists(conn, "analytics", "domain_scores")

    if has_scores:
        score_join = (
            "LEFT JOIN analytics.scenario_scores s "
            "ON t.tract_geoid_2020 = s.tract_geoid_2020 AND s.scenario_id = ?"
        )
        score_cols = "s.score, s.coverage_fraction"
        params: list[Any] = [scenario_id]
    else:
        score_join = ""
        score_cols = "NULL AS score, NULL AS coverage_fraction"
        params = []

    if has_stability:
        stability_join = (
            "LEFT JOIN analytics.stability_labels st "
            "ON t.tract_geoid_2020 = st.tract_geoid_2020 AND st.scenario_id = ?"
        )
        stability_col = "st.stability_label"
        params.append(scenario_id)
    else:
        stability_join = ""
        stability_col = "NULL AS stability_label"

    if has_domain_scores:
        domain_joins = "\n".join(
            f"LEFT JOIN analytics.domain_scores d_{name} "
            f"ON t.tract_geoid_2020 = d_{name}.tract_geoid_2020 AND d_{name}.domain = '{name}'"
            for name in _DOMAIN_NAMES
        )
        domain_cols = ", ".join(f"d_{name}.score AS {name}_score" for name in _DOMAIN_NAMES)
    else:
        domain_joins = ""
        domain_cols = ", ".join(f"NULL AS {name}_score" for name in _DOMAIN_NAMES)

    sql = f"""
        SELECT t.tract_geoid_2020, t.name_long, ST_AsGeoJSON(t.geometry),
               {score_cols}, {stability_col}, {domain_cols}
        FROM geo.tracts t
        {score_join}
        {stability_join}
        {domain_joins}
        ORDER BY t.tract_geoid_2020
    """
    rows = conn.execute(sql, params).fetchall()

    features = []
    for row in rows:
        (
            tract_geoid,
            name_long,
            geometry_json,
            score,
            coverage_fraction,
            stability_label,
            *domain_scores,
        ) = row
        properties = {
            "tract_geoid_2020": tract_geoid,
            "name": name_long,
            "score": score,
            "coverage_fraction": coverage_fraction,
            "stability_label": stability_label,
        }
        for name, domain_score in zip(_DOMAIN_NAMES, domain_scores, strict=True):
            properties[f"{name}_score"] = domain_score
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(geometry_json),
                "properties": properties,
            }
        )
    return features
