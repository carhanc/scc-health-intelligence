# DATA_DICTIONARY.md

**Status: geography dimension tables complete (Phase 2); raw source tables loaded (Phase 3); derived metric/domain-score tables pending Phase 4.** This document is populated incrementally as each source adapter and metric is implemented. It is the human-readable companion to `config/metrics.yml` (machine-readable, authoritative for scoring/UI) and `DATA_MANIFEST.json` (machine-readable, authoritative for provenance). No metric may appear in the product before it has an entry here.

Phase 3 loaded the *raw/staged source tables* listed in "Source tables (Phase 3 — implemented)" below — these are normalized, tract/facility/stop-level tables straight from each source adapter, not yet the derived, weighted, uncertainty-propagated domain-score metrics Phase 4 will build on top of them. A Phase 3 table appearing here does not mean its values are already scored into a composite index.

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

## Source tables (Phase 3 — implemented)

All tables live in `warehouse/scc_health.duckdb`, loaded by
`pipelines/src/scc_health_pipeline/run_core_sources_pipeline.py`. Row counts
are from the live Phase 3 build (2026-07-12); see `DATA_MANIFEST.json` for
per-source publisher/vintage/license/retrieval-time provenance and
`docs/data/source-verification.md` for source verification detail.

### `health.places_observations` — 16,320 rows

CDC PLACES 2025 release, tract-level health measure estimates (BRFSS 2022–2023 underlying survey years). Long-form: one row per tract per measure. Key fields: `tract_geoid_2020` (string, 11 chars), `measure`/`short_question_text`, `data_value` (estimate), `data_value_unit` (e.g. `%`), `low_confidence_limit`/`high_confidence_limit` (95% CI bounds — see `uncertainty/moe.py::places_ci_to_standard_error`), `suppression_flag` (all-null for this county/release — DEC-019). Not yet folded into a health-burden domain score (Phase 4).

### `context.svi` — 408 rows

CDC/ATSDR Social Vulnerability Index 2022 (underlying ACS 2018–2022), tract level, one row per tract. Percentile-rank fields; `-999` source sentinel nulled and flagged via `had_suppressed_field`. Used as an independent benchmark, not folded into composite scores (per `docs/02_DATA_SOURCE_REGISTRY.md` §7.1).

### `context.calenviroscreen` — 408 rows

CalEnviroScreen 5.0 final release (finalized 2026-07-01), tract level. All indicator + percentile columns preserved, including two new-in-5.0 indicators (`diabetes`/`diabetesP`, `SmATS`/`SmATSP`). Not directly comparable to 4.0-era scores (DEC-007).

### `social.acs_observations` — 40,392 rows

ACS 2020–2024 5-year estimates, long-form (one row per tract per table per line). Currently covers 3 tables (DEC-020): B01003 (total population), B17001 (poverty status by sex/age), B18101 (disability status by sex/age). Fields: `tract_geoid_2020`, `table_id`, `line`, `estimate`, `moe_90` (90% CI margin of error, `-555555555` sentinel nulled), `standard_error` (derived via `uncertainty/moe.py::acs_moe_to_standard_error`). 100% of rows retain a margin of error.

### `resources.hcai_facilities` — 204 rows

HCAI-licensed healthcare facility attributes (CC-BY), dynamically discovered via CKAN `package_show` with a pinned fallback URL, filtered to Santa Clara County via a real point-in-polygon spatial join against `geo.county` (not city/ZIP text matching).

### `resources.hrsa_health_center_sites` — 98 rows

HRSA-funded health center service-delivery and look-alike sites, daily-refresh source.

### `resources.snap_retailers` — 2,163 rows

USDA SNAP-authorized retailer locations, historical bulk file 2005–2025 (FNS→FNA rebrand handled). `currently_authorized` derived from a blank End Date. 796 currently authorized; the remainder are historical/deauthorized and retained for completeness.

### `resources.transit_stops` / `transit_routes` / `transit_trips` / `transit_stop_times` / `transit_calendar` / `transit_stop_frequency_summary`

VTA static GTFS feed, parsed into the standard GTFS tables plus one derived per-stop frequency summary. 3,345 stops, 72 routes, 11,085 trips, 427,720 stop_times. Foreign-key integrity (trips→routes, stop_times→trips/stops) checked in `quality_checks()`.

### `resources.hrsa_hpsa` — 148 rows

HRSA Health Professional Shortage Area designations, three disciplines unioned into one table with a `discipline` column (primary care 31, dental 17, mental health 100) — kept distinguishable, never collapsed into a single "has a shortage" flag.

### `resources.hrsa_mua_p` — 48 rows

HRSA Medically Underserved Area/Population designations. `designation_population` is all-null for this county (verified against the raw source file — DEC-019).

### `utilization.hcai_ed_patient_county` — 796 rows

HCAI ED encounters by patient county of residence, four breakdowns unioned with a `breakdown_category` column (disposition/race_group/sex/expected_payer). `is_suppressed` flag + null (never zero) `encounters` for masked cells — includes 2 real suppressed Santa Clara County rows. Native geography is patient county of residence, not tract, not facility location.

### `utilization.hcai_ed_facility_profile` — 9 rows

HCAI ED characteristics by facility, 2024, pivot-profile "Data" sheet only (the workbook's "Profile"/"Pivot" sheets are interactive Excel UI, not tabular data, and are not parsed).

### `utilization.hcai_patient_origin` — 31,462 rows

HCAI patient-origin/market-share pivot profile, 2024. Native geography is patient ZIP / facility, not tract. Ambulatory-surgery market share excludes physician-owned clinics by design (`AMBULATORY_SURGERY_EXCLUSION_NOTE` on every row) — disclosed, not silently absorbed into the estimate.

### Not yet implemented (deferred, documented)

- California Healthy Places Index 3.0 — intentionally blocked, no automatable keyless path (DEC-018, RISK-013).
- ACS tables beyond population/poverty/disability (income, insurance coverage, vehicle access, language isolation, housing cost burden, education) — DEC-020, RISK-014.
- HUD USPS ZIP-tract crosswalk (optional enhancement, DEC-014).
- Additional SCC GIS layers beyond supervisor districts (Parks, Community Service Districts — verified available, DEC-021).
- A unified, deduplicated `resources.facilities` table merging `resources.hcai_facilities` and `resources.hrsa_health_center_sites` by coordinate/name/address — deferred to Phase 6 (Access Lab), where deduplication is actually needed for routing/optimization.

## Versioning

This file's structure is versioned alongside the metric registry (`config/metrics.yml`). Material changes to a metric's definition, source, or geography require a new metric ID version suffix and a changelog entry here, not a silent in-place edit — per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Governance for scores and models."
