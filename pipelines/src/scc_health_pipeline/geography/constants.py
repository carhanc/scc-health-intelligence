"""Canonical geography constants (PLAN.md §4, docs/02_DATA_SOURCE_REGISTRY.md §3).

All identifiers are strings. Leading zeros are significant and must never be
stripped by numeric type inference at any read/write boundary.
"""

from __future__ import annotations

STATE_FIPS_CA = "06"
COUNTY_FIPS_SANTA_CLARA = "085"
COUNTY_GEOID_SANTA_CLARA = "06085"

# Canonical tract vintage. ACS 5-year, PLACES, and SVI are all published
# against 2020 Census tract numbering -- see DECISIONS.md DEC-004.
TRACT_VINTAGE = "2020"

# Web delivery CRS (WGS84) vs. a California-appropriate projected CRS for
# accurate area/distance calculations (docs/02 §4.3).
CRS_WEB_WGS84 = "EPSG:4326"
CRS_CALIFORNIA_ALBERS = "EPSG:3310"  # NAD83 California Albers (equal-area)

TRACT_GEOID_LENGTH = 11
