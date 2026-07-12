# DATA_DICTIONARY.md

**Status: geography dimension tables complete (Phase 2); metric tables pending Phase 3–4.** This document is populated incrementally as each source adapter and metric is implemented. It is the human-readable companion to `config/metrics.yml` (machine-readable, authoritative for scoring/UI) and `DATA_MANIFEST.json` (machine-readable, authoritative for provenance). No metric may appear in the product before it has an entry here.

## How to read this document

Each metric entry will contain: canonical metric ID, plain-language label, definition, domain/subdomain, numerator/denominator, unit, directionality (concern_high / concern_low / neutral), source ID (linking to `DATA_MANIFEST.json` and `docs/data/source-verification.md`), geography level(s) it is valid at, vintage, uncertainty field(s) present, transformation applied, minimum coverage threshold, known limitations, and citation string.

## Structure (to be populated per domain)

### 1. Health burden
_Metrics pending Phase 3–4 implementation: diabetes prevalence, obesity, hypertension, coronary heart disease, stroke, COPD, depression, frequent mental/physical distress, physical inactivity, smoking, routine checkup, uninsured (if not duplicated by ACS), food insecurity/health-related social needs, disability, self-rated health — all from CDC PLACES 2025 release. See `docs/03_ANALYTICS_METHODS.md` §4.1 for subdomain grouping (cardiometabolic, mental health, functional/physical health, behavior/risk)._

### 2. Access and socioeconomic barriers
_Metrics pending: uninsured, poverty, limited English proficiency, no-vehicle households, disability, older adults, broadband access, housing cost burden, overcrowding, public coverage/Medi-Cal proxy — from ACS 2020–2024 5-year estimates. See `docs/03_ANALYTICS_METHODS.md` §4.2._

### 3. Resource accessibility
_Metrics pending: travel time to clinical care/FQHC/hospital/pharmacy/behavioral health/food resource, transit service frequency, resources within 15/30/45 minutes, E2SFCA score — computed in Phase 6 from HRSA/HCAI facility data + VTA GTFS + OSM network routing._

### 4. Environmental/contextual burden
_Metrics pending: CalEnviroScreen 5.0 component indicators (pollution burden, population vulnerability, including the two new 5.0 indicators: Diabetes Prevalence, Small Air Toxic Sites)._

### 5. ED utilization pressure
_Metrics pending: ED visits per 1,000, admissions through ED, ambulatory-care-sensitive diagnosis rate, uninsured/self-pay share, Medi-Cal share, out-of-county flow — from HCAI ED encounters + patient-origin/market-share data, Phase 7._

### 6. Workforce shortage
_Metrics pending: HPSA designation/score, MUA/P designation, provider density (NPPES, labeled administrative only), FQHC/health-center availability — Phase 3/6._

### 7. Data confidence
_Composite domain (not "need"): source freshness, estimate precision, geography quality (native vs. crosswalked), source tier, suppression, sample/model limitations, rank stability — computed alongside every domain/scenario score, Phase 4. See `docs/03_ANALYTICS_METHODS.md` §4.7._

### 8. Contextual/benchmark indices (not scored into composites)
_CDC/ATSDR SVI 2022 and California Healthy Places Index 3.0 — used as independent comparison benchmarks, not folded into domain scores to avoid double-counting (per `docs/02_DATA_SOURCE_REGISTRY.md` §7.1, §7.3)._

## Geography dimension tables (Phase 2 — implemented and audited)

All tables live in `warehouse/scc_health.duckdb` (live) or `warehouse/scc_health_demo.duckdb`
(offline snapshot, DEC-015/DEC-016), schema `geo`. Row counts below are from the live
Phase 2 build (2026-07-11); see `docs/data/source-verification.md` for full source
provenance and `docs/methods/geography.md` for the harmonization methodology.

### `geo.tracts` — 408 rows

Canonical 2020 Census tract boundaries for Santa Clara County (TIGER/Line, full resolution).

| Field | Type | Notes |
|---|---|---|
| `tract_geoid_2020` | string, 11 chars | Canonical primary key. Leading zeros preserved (audited). |
| `state_fips` | string, 2 chars | Always `06`. |
| `county_fips` | string, 3 chars | Always `085`. |
| `tract_code` | string, 6 chars | TIGER `TRACTCE`. |
| `name`, `name_long` | string | e.g. `5001`, `Census Tract 5001`. |
| `area_land_sqm`, `area_water_sqm` | float | Square meters. |
| `internal_point_lat`, `internal_point_lon` | **string** | TIGER stores these as text with a leading sign (e.g. `"+37.123456"`); cast to `DOUBLE` before numeric use — confirmed the hard way during audit development (`docs/07_BUILD_PHASES.md` Phase 2). |
| `geometry` | GEOMETRY | WGS84 (EPSG:4326). |

### `geo.places` — 30 rows

Incorporated places (cities) from the statewide TIGER/Line file, spatially filtered to those intersecting Santa Clara County. Primary key `place_geoid` (7 chars, state+place FIPS). Note: places are not clipped to the county boundary — a place's stored geometry is its full extent even if it straddles a county line.

### `geo.zctas` — 70 rows

ZCTA boundaries (Census cartographic 1:500,000 boundary, `geometry_precision = "cartographic_500k"` per DEC-013), coarse-prefiltered to `94xxx`/`95xxx` then spatially filtered to those intersecting the county. Primary key `zcta_geoid`. Additional fields `fraction_in_county` (0–1) and `fully_within_county` (boolean, `fraction_in_county >= 0.999`) disclose partial-overlap ZCTAs rather than treating every listed ZCTA as fully contained.

### `geo.county` — 1 row

Santa Clara County boundary (Census cartographic 1:500,000). Primary key `county_geoid = "06085"`.

### `geo.supervisor_districts` — 5 rows

Board of Supervisors districts (Santa Clara County Dept. of Planning and Development, `PlanningOfficeDataService2` layer 5 — see DEC-012 for why this source was chosen over an alternative that lacked verifiable district-number labels). Fields: `district_number` (1–5), `supervisor_name`, `area_acres`, `area_sq_miles`.

### `geo.tract_supervisor_district_assignment` — 408 rows

Every tract assigned to its majority-area-overlap supervisor district, computed in a California-appropriate equal-area projected CRS (EPSG:3310), not raw WGS84 degrees. Fields: `tract_geoid_2020`, `supervisor_district`, `primary_district_share` (0–1), `is_clean_assignment` (boolean, `primary_district_share >= 0.95`), `all_district_shares` (semicolon-delimited `district:share` pairs for **every** district the tract overlaps, not just the winner — boundary-crossing tracts are disclosed, never silently collapsed to one district). 35 of 408 tracts (8.6%) are boundary-crossing.

### `geo.crosswalk_zip_tract` — 638 rows

Census 2020 ZCTA-to-tract area relationship (DEC-005 default keyless crosswalk). Fields: `zcta_geoid`, `tract_geoid_2020`, `area_land_part_sqm`, `zcta_total_area_land_sqm` (computed across *all* of that ZCTA's tracts nationally, not just the Santa Clara subset, so a ZCTA straddling a county line still has a correct denominator), `weight` (0–1, sums to ≤1 per ZCTA for the Santa-Clara-County portion — audited), `allocation_method = "area_weighted_census_relationship"`, `allocation_quality = "moderate_confidence_crosswalk"`.

### `geo.crosswalk_unassigned_tract_land` — 4 rows

Small tract-land slivers with zero ZCTA overlap (a real, rare edge case in the source data — retained for audit transparency rather than silently dropped). Fields: `tract_geoid_2020`, `area_land_part_sqm`.

### Not yet implemented (deferred, documented)

- HUD USPS ZIP-tract crosswalk (optional enhancement, DEC-005/DEC-014 — requires `HUD_USER_TOKEN`).
- `geo.hpsa_mua` (HPSA/MUA/P designation areas) — Phase 3, alongside the HRSA HPSA source adapter.
- State/federal legislative and congressional districts — not required by Phase 2 scope.

## Resource dimension tables (Phase 3/6)

- `resources.facilities` (HCAI licensed facilities, HRSA health centers, deduplicated)
- `resources.transit_stops` (VTA GTFS)
- `resources.food_resources` (USDA SNAP retailers)
- `resources.community_resources` (SCC GIS Hub public assets)

## Versioning

This file's structure is versioned alongside the metric registry (`config/metrics.yml`). Material changes to a metric's definition, source, or geography require a new metric ID version suffix and a changelog entry here, not a silent in-place edit — per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Governance for scores and models."
