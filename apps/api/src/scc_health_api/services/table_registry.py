"""Registry mapping each manifest source_id to the warehouse table(s) it
feeds, and listing every warehouse table for the data-explorer endpoint.

Mirrors the table_outputs produced by
pipelines/.../run_core_sources_pipeline.py and
pipelines/.../run_geography_pipeline.py. Kept as a small static registry
(rather than introspecting the pipeline package) for the same reason as
services/freshness.py: the API stays a lightweight process independent of
the heavy pipeline dependency chain.
"""

from __future__ import annotations

from dataclasses import dataclass

# source_id -> list of (schema, table) it contributes rows to. A source_id
# maps to more than one table only when several source_ids are unioned
# into one table (e.g. the four ACS table adapters all land in
# social.acs_observations); a source_id whose adapter produces several
# distinct tables (e.g. GTFS) is listed against all of them.
SOURCE_TO_TABLES: dict[str, list[tuple[str, str]]] = {
    "tiger_tract_2020": [("geo", "tracts")],
    "tiger_place_2020": [("geo", "places")],
    "census_county_cartographic_2020": [("geo", "county")],
    "census_zcta_cartographic_2020": [("geo", "zctas")],
    "census_zcta_tract_relationship_2020": [
        ("geo", "zcta_tract_crosswalk"),
        ("geo", "zcta_tract_unassigned_land"),
    ],
    "scc_supervisor_districts_2025": [("geo", "supervisor_districts")],
    "cdc_places_tract_2025": [("health", "places_observations")],
    "cdc_atsdr_svi_2022": [("context", "svi")],
    "ca_hpi_3_0": [],  # documented-blocked source; no table (DEC-018)
    "calenviroscreen_5_0": [("context", "calenviroscreen")],
    "acs_5year_geo_crosswalk": [],  # intermediate crosswalk, not a warehouse table itself
    "acs_5year_b01003": [("social", "acs_observations")],
    "acs_5year_b17001": [("social", "acs_observations")],
    "acs_5year_b18101": [("social", "acs_observations")],
    "hcai_facility_attributes": [("resources", "hcai_facilities")],
    "hrsa_health_center_sites": [("resources", "hrsa_health_center_sites")],
    "usda_snap_retailers": [("resources", "snap_retailers")],
    "vta_gtfs": [
        ("resources", "transit_stops"),
        ("resources", "transit_routes"),
        ("resources", "transit_trips"),
        ("resources", "transit_stop_times"),
        ("resources", "transit_calendar"),
        ("resources", "transit_stop_frequency_summary"),
    ],
    "hrsa_hpsa_primary_care": [("resources", "hrsa_hpsa")],
    "hrsa_hpsa_dental": [("resources", "hrsa_hpsa")],
    "hrsa_hpsa_mental_health": [("resources", "hrsa_hpsa")],
    "hrsa_mua_p": [("resources", "hrsa_mua_p")],
    "hcai_ed_patient_county_disposition": [("utilization", "hcai_ed_patient_county")],
    "hcai_ed_patient_county_race_group": [("utilization", "hcai_ed_patient_county")],
    "hcai_ed_patient_county_sex": [("utilization", "hcai_ed_patient_county")],
    "hcai_ed_patient_county_expected_payer": [("utilization", "hcai_ed_patient_county")],
    "hcai_ed_facility_profile": [("utilization", "hcai_ed_facility_profile")],
    "hcai_patient_origin_market_share": [("utilization", "hcai_patient_origin")],
}


@dataclass(frozen=True)
class TableDescriptor:
    schema: str
    table: str
    description: str


ALL_TABLES: list[TableDescriptor] = [
    TableDescriptor(
        "geo", "tracts", "2020 Census tract boundaries and identity, Santa Clara County."
    ),
    TableDescriptor("geo", "places", "2020 Census place (city/town) boundaries."),
    TableDescriptor("geo", "county", "Santa Clara County boundary."),
    TableDescriptor("geo", "zctas", "ZIP Code Tabulation Area boundaries (coarse-filtered)."),
    TableDescriptor("geo", "zcta_tract_crosswalk", "ZCTA-to-tract area-weighted crosswalk."),
    TableDescriptor(
        "geo",
        "zcta_tract_unassigned_land",
        "Unassigned-land slivers from the ZCTA-tract relationship file.",
    ),
    TableDescriptor(
        "geo", "supervisor_districts", "County Board of Supervisors district boundaries."
    ),
    TableDescriptor(
        "health", "places_observations", "CDC PLACES tract-level health measure estimates."
    ),
    TableDescriptor("context", "svi", "CDC/ATSDR Social Vulnerability Index, tract level."),
    TableDescriptor(
        "context",
        "calenviroscreen",
        "CalEnviroScreen 5.0 environmental burden scores, tract level.",
    ),
    TableDescriptor(
        "social",
        "acs_observations",
        "ACS 5-year estimates (population, poverty, disability) with margins of error.",
    ),
    TableDescriptor(
        "resources",
        "hcai_facilities",
        "HCAI-licensed healthcare facility attributes (spatially joined to county).",
    ),
    TableDescriptor(
        "resources",
        "hrsa_health_center_sites",
        "HRSA-funded health center service delivery/look-alike sites.",
    ),
    TableDescriptor(
        "resources",
        "snap_retailers",
        "USDA SNAP-authorized retailer locations, historical 2005-2025.",
    ),
    TableDescriptor("resources", "transit_stops", "VTA GTFS static stops."),
    TableDescriptor("resources", "transit_routes", "VTA GTFS static routes."),
    TableDescriptor("resources", "transit_trips", "VTA GTFS static trips."),
    TableDescriptor("resources", "transit_stop_times", "VTA GTFS static stop_times."),
    TableDescriptor("resources", "transit_calendar", "VTA GTFS static service calendar."),
    TableDescriptor(
        "resources",
        "transit_stop_frequency_summary",
        "VTA GTFS derived per-stop trip-frequency summary.",
    ),
    TableDescriptor(
        "resources",
        "hrsa_hpsa",
        "HRSA Health Professional Shortage Area designations (primary care/dental/mental health).",
    ),
    TableDescriptor(
        "resources", "hrsa_mua_p", "HRSA Medically Underserved Area/Population designations."
    ),
    TableDescriptor(
        "utilization",
        "hcai_ed_patient_county",
        "HCAI ED encounters by patient county of residence "
        "(disposition/race/sex/payer breakdowns).",
    ),
    TableDescriptor(
        "utilization", "hcai_ed_facility_profile", "HCAI ED characteristics by facility, 2024."
    ),
    TableDescriptor(
        "utilization", "hcai_patient_origin", "HCAI patient-origin/market-share pivot profile."
    ),
]
