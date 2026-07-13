# DATA_DICTIONARY.md

**Status: geography dimension tables complete (Phase 2); raw source tables loaded (Phase 3); derived metric/domain-score/scenario/uncertainty/sensitivity/optimization tables loaded (Phase 4).** This document is populated incrementally as each source adapter and metric is implemented. It is the human-readable companion to `config/metrics.yml` (machine-readable, authoritative for scoring/UI) and `DATA_MANIFEST.json` (machine-readable, authoritative for provenance). No metric may appear in the product before it has an entry here.

Phase 3 loaded the *raw/staged source tables* listed in "Source tables (Phase 3 — implemented)" below — these are normalized, tract/facility/stop-level tables straight from each source adapter, not yet the derived, weighted, uncertainty-propagated domain-score metrics Phase 4 will build on top of them. A Phase 3 table appearing here does not mean its values are already scored into a composite index.

## How to read this document

Each metric entry will contain: canonical metric ID, plain-language label, definition, domain/subdomain, numerator/denominator, unit, directionality (concern_high / concern_low / neutral), source ID (linking to `DATA_MANIFEST.json` and `docs/data/source-verification.md`), geography level(s) it is valid at, vintage, uncertainty field(s) present, transformation applied, minimum coverage threshold, known limitations, and citation string.

## Structure (per domain — implemented Phase 4)

Full per-metric detail (definition, transform, uncertainty type, limitations, citation) lives in `config/metrics.yml`; this section summarizes what is implemented per domain. See `MODEL_CARD.md` "Scoring method" for the aggregation formula and `analytics.metric_scores`/`analytics.metric_contributions` below for the persisted computed values.

### 1. Health burden — 16 metrics, source: CDC PLACES 2025
Subdomains: **cardiometabolic** (diabetes, high blood pressure, coronary heart disease, stroke, obesity, high cholesterol), **mental_health** (depression, frequent mental distress), **functional_physical** (frequent physical distress, fair/poor self-rated health, any disability), **behavior_risk** (current smoking, physical inactivity, binge drinking). See `docs/03_ANALYTICS_METHODS.md` §4.1.

### 2. Access and socioeconomic barriers — 7 metrics, sources: CDC PLACES + ACS 2020-2024 5-year
Subdomains: **affordability_coverage** (PLACES uninsured rate, ACS poverty rate), **mobility** (PLACES transportation barriers), **functional_access** (ACS all-ages disability rate), **material_hardship** (PLACES housing insecurity, food insecurity). No `language_navigation` subdomain (DEC-027 — no ACS language-isolation table ingested). See `docs/03_ANALYTICS_METHODS.md` §4.2.

### 3. Resource accessibility — 1 metric (straight-line screening, DEC-024)
Subdomain **clinical_care_access**: straight-line distance from each tract's internal point to the nearest clinical-care site (HCAI general acute care/community/free/surgical/dialysis clinic, or active HRSA health center). Full network-routing version (walking/driving/transit) is Phase 6 scope. See `docs/03_ANALYTICS_METHODS.md` §4.3.

### 4. Environmental/contextual burden — 2 metrics, source: CalEnviroScreen 5.0
Subdomains **pollution_burden** (`PollutionP`) and **population_vulnerability** (`PopCharP`), each CalEnviroScreen's own statewide percentile re-ranked county-relative (DEC-032). Includes the two new-in-5.0 indicator families (Diabetes Prevalence, Small Air Toxic Sites) within CalEnviroScreen's own composite, though not broken out as separate metrics in Phase 4's registry.

### 5. ED utilization pressure — not built as a tract-level domain (DEC-023)
HCAI ED patient-county data (Phase 3) is native to county of residence; Santa Clara is the only county present, so no defensible tract-level allocation exists without fabrication. Used instead as a Phase 4 correlation-diagnostic candidate (blocked by n=1, see `analytics.correlation_diagnostics` and RISK-015); a genuine tract-level utilization metric is reserved for Phase 7.

### 6. Workforce shortage — 2 metrics (precomputed geospatial joins)
Subdomain **shortage_designation**: `mua_designated_flag`, a direct tract-code join against HRSA's own `census_tract_raw` field (DEC-025, 46/48 matched). Subdomain **shortage_intensity**: `hpsa_proximity_score`, straight-line inverse-distance-weighted sum over 39 Designated, coordinate-bearing HPSA records (DEC-026).

### 7. Data confidence — computed per (tract, scenario), not a domain score
`confidence = 0.35·coverage + 0.30·precision + 0.20·geography_quality + 0.15·freshness_source` (docs §8.4), implemented in `scoring/data_confidence.py`, persisted in `analytics.data_confidence`. Never treated as need; annotates every score rather than gating it.

### 8. Contextual/benchmark indices (not scored into composites)
CDC/ATSDR SVI 2022 (`context.svi`) — used as the Phase 4 convergent-validity benchmark (DEC-033), never a metric-registry input (confirmed by the tautology guard on every pipeline run). California Healthy Places Index 3.0 — documented-blocked, no data (DEC-018).

## Analytics tables (Phase 4 — implemented)

All tables live in `warehouse/scc_health.duckdb`, schema `analytics`, loaded by
`pipelines/src/scc_health_pipeline/run_analytics_pipeline.py`. Row counts are
from the live Phase 4 build (2026-07-12). **No offline demo snapshot exists
yet for this schema** (DEC-035/RISK-019) — every `analytics.*` table requires
`make data` (live mode).

### `analytics.workforce_shortage_inputs` / `analytics.resource_accessibility_inputs` — 408 rows each
Precomputed geospatial join outputs (DEC-024/025/026) feeding the `workforce_shortage`/`resource_accessibility` metrics. Fields include `method = "straight_line_screening"` on every row.

### `analytics.metric_scores` — 10,200 rows (25 metrics × 408 tracts)
Per-metric, per-tract: `raw_value`, `concern_value` (direction-aligned), `percentile` (county-relative, 0-100), `standard_error`/`low_confidence_limit`/`high_confidence_limit` where the source provides them.

### `analytics.domain_scores` — 2,040 rows (5 domains × 408 tracts)
Per-domain, per-tract: `score` (`NULL`, never 0, if below the 70% subdomain-coverage threshold), `coverage_fraction`, `subdomains_present`/`subdomains_missing` (semicolon-delimited), `below_coverage_threshold`.

### `analytics.scenario_scores` — 2,856 rows (7 scenarios × 408 tracts)
Per-scenario, per-tract: `score`, `coverage_fraction` (share of configured domain weight actually present), `domains_missing`.

### `analytics.metric_contributions` — 66,504 rows
The full explainability decomposition, one row per (scenario, tract, contributing metric): `effective_weight` (cascaded equal-weighting), `contribution` (`effective_weight × percentile`), plus raw value/unit/direction/uncertainty/source/citation/limitations. Summing `contribution` for a given (tract, scenario) reproduces `analytics.scenario_scores.score` exactly (audited on every `make audit` run).

### `analytics.data_confidence` — 2,856 rows
Per-scenario, per-tract confidence score and its 4 components (see domain 7 above).

### `analytics.monte_carlo_results` — 2,856 rows
Per-scenario, per-tract: `median_score`, `ci_lower`/`ci_upper` (10th-90th percentile), `median_rank`, `rank_ci_lower`/`rank_ci_upper`, `probability_top_decile`/`probability_top_quartile`, `n_draws` (500), `seed` (42).

### `analytics.weight_sensitivity_results` — 2,856 rows
Per-scenario, per-tract Dirichlet random-weight sensitivity: `median_rank`, `rank_ci_lower`/`rank_ci_upper`, `rank_std`, `probability_top_decile`/`probability_top_quartile`, `most_influential_domain`, `n_draws` (1,000), `seed` (42).

### `analytics.stability_labels` — 2,856 rows
Per-scenario, per-tract: one of `Robust`/`Moderately stable`/`Assumption-sensitive`/`Data-limited` (see `MODEL_CARD.md` "Sensitivity").

### `analytics.preset_scenario_scores` — 2,040 rows (5 presets × 408 tracts)
Scenario-independent preset-sensitivity scores (see `MODEL_CARD.md` "Sensitivity" — `systemic_pressure_first` replaces docs' "utilization-first," DEC-028).

### `analytics.correlation_diagnostics` — 7 rows (one per scenario)
Convergent-validity Spearman/Pearson correlation + bootstrap 95% CI vs. CDC/ATSDR SVI `RPL_THEMES` (DEC-033). Every row has `is_tautological = false` (enforced by the tautology guard before computation, not merely flagged after).

### `analytics.optimization_runs` — 3 rows
Location-allocation optimizer results (mobile-clinic siting scenario, DEC-034): k=5/2mi and k=10/2mi solved OPTIMAL; k=10/1mi correctly INFEASIBLE given the 50%-high-need equity constraint at that tighter radius. Fields include `selected_sites`, `population_covered`, `high_need_population_covered`, `unserved_high_need_tracts`, `marginal_gain_per_site` is available via the underlying `OptimizationResult` dataclass (not persisted as a separate column; recomputable from `covering_sites` if needed).

### Not yet implemented (deferred, documented)

- A genuine tract-level `ed_utilization_pressure` domain and its criterion-validity check (Phase 7, DEC-023/DEC-033, RISK-015).
- Network-routing versions of `resource_accessibility`/`workforce_shortage` (Phase 6, DEC-024, RISK-016).
- `acs_disability_rate`'s combined 12-line-sum margin of error (DEC-031, RISK-018).
- An offline demo snapshot of `analytics.*` (DEC-035, RISK-019).
- A `language_navigation` access_barriers subdomain (DEC-027).

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
- Libraries, community centers, senior centers, and pharmacies as canonical facility categories — no verified official bulk source found this session (DEC-045, RISK-022).

## Phase 6 tables (Access Lab — implemented)

### `geo.block_group_population_origins` — 1,173 rows

Census Bureau 2020 Mean Center of Population, block-group level (DEC-044). Fields: `block_group_geoid` (12-char), `tract_geoid_2020` (11-char), `latitude`, `longitude`, `population`. Every tract has ≥1 origin (audited); total population reconciles with the independent ACS B01003 total within 1.8% (audited).

### `resources.canonical_facilities` — 4,207 rows

Deduplicated, cross-source-matched facility inventory (15 hospitals, 155 clinics, 796 food retailers, 3,241 transit hubs). Fields include `canonical_resource_id`, `category`, `subtype`, `name`, `address`, `latitude`/`longitude`, `is_official`, `dedup_status` (`single_source` | `matched_multi_source`), `coordinate_quality`, `n_contributing_sources`, `limitation_notes`. See `docs/methods/accessibility.md` §2.

### `resources.facility_source_crosswalk` / `facility_duplicate_review` / `facility_rejected_records` / `facility_category_coverage`

Full source lineage for every canonical facility (never lost on merge); every merge/non-merge decision with its distance/name-similarity evidence; records rejected outright (e.g. missing name) rather than silently dropped; category coverage summary.

### `analytics.network_access_metrics` — 4,692 rows

Nearest hospital/clinic by real walk/drive network distance and duration per population origin. Fields: `block_group_geoid`, `tract_geoid_2020`, `mode`, `category`, `status`, `nearest_facility_id`, `distance_miles`, `duration_minutes`, `method`, `unavailable_reason`. Complete (origin × mode × category) coverage — an unreachable combination is a `status="unavailable"` row with a stated reason, never a silently missing one (audited).

### `analytics.transit_access_metrics` — 1,173 rows

Best-served walkable transit stop per population origin, real GTFS-derived weekday-daytime headway. Fields include `nearest_stop_id`, `walk_distance_miles`, `n_trips_in_window`, `headway_minutes`, `service_level`, `service_window`. `method` is always `"scheduled_transit_access_proxy"` (audited) — never presented as real-time.

### `analytics.e2sfca_accessibility` — 4,692 rows

E2SFCA catchment accessibility per population origin, mode, and category. Fields include `capacity_type` (`real_capacity` | `count_proxy`, never mixed within a category — audited), `accessibility_score`, `n_facilities_in_catchment`, `catchment_radius_miles`, `sigma_miles`. See `docs/methods/e2sfca.md`.

### `analytics.optimization_runs` — 6 rows (extended from Phase 4's 3)

Mobile-clinic siting sensitivity sweep varying k_sites/distance_threshold/equity constraint, including one real `INFEASIBLE` result. See `docs/methods/optimization.md`.

## Phase 7 tables (Utilization / Prioritize / Validate — implemented)

### `analytics.utilization_ed_zip_observed` — 213 rows

Real, observed 2024 ED-related encounters by patient ZIP code, for Santa Clara County residents only (`patient_county_name = 'SANTA CLARA'`), split by `pattype_group` (`ed_only` | `inpatient_from_ed`, never combined). Fields: `patient_zip`, `pattype_group`, `encounters`, `reporting_year`, `geography_level="patient_zip"`, `data_status="observed"`. Aggregated directly from `utilization.hcai_patient_origin` — native geography, not allocated.

### `analytics.utilization_ed_tract_modeled` — 816 rows

**Modeled**, not observed: `analytics.utilization_ed_zip_observed` allocated to tracts via the area-weighted `geo.crosswalk_zip_tract` (DEC-055). Fields: `tract_geoid_2020`, `pattype_group`, `modeled_encounters` (float, not an integer count — a fractional allocation), `n_contributing_zips`, `crosswalk_quality`, `method="zip_to_tract_area_weighted_allocation"`, `data_status="modeled"`. 2.3% of observed ZIP-level encounters could not be allocated (no crosswalk entry) — disclosed in pipeline diagnostics, not silently dropped from any total.

### `analytics.utilization_ed_facility_summary` — 9 rows

Real, observed 2024 ED characteristics per Santa Clara facility, reshaped from `utilization.hcai_ed_facility_profile`'s 179 wide columns. Fields include `oshpd_id`, `facility_name`, `city`, `zip_code` (zero-padded string), `license_category`, `trauma_center_level`, `er_service_level`, `licensed_bed_band` (a published band, e.g. "200-299", not an exact count), `total_ed_encounters` (COALESCEd across sex/payer/disposition breakdowns — whichever is unmasked first; verified all 9 facilities resolve), plus per-facility disposition/payer/language breakdown columns, `data_status="observed"`.

### `analytics.utilization_ed_county_trends` — 796 rows

Real Santa Clara County ED encounters by year, 2008-2024, reshaped from `utilization.hcai_ed_patient_county`'s 4 breakdowns. Fields: `breakdown_category`, `category_value`, `service_year`, `encounters` (null, never zero, when `is_suppressed`), `is_suppressed`, `suppression_annotation_desc`, `geography_level="county"`, `data_status` (`observed` | `suppressed`).

### `analytics.utilization_access_vs_utilization` — 408 rows (one per tract)

Tract-level join of `analytics.utilization_ed_tract_modeled` (both `pattype_group`s summed) against `health.places_observations`' population and `analytics.e2sfca_accessibility`'s drive-mode hospital access score. Fields: `modeled_ed_encounters_combined`, `total_population`, `modeled_ed_rate_per_1000`, `e2sfca_hospital_drive_access_score`, `rate_reliability` (`plausible_range` | `low_reliability`, DEC-056), `rate_reliability_note`, `method`, `data_status="modeled"`. 392 of 408 tracts (96.1%) are `plausible_range`; 16 are `low_reliability`.

### `analytics.utilization_criterion_validity` — 8 rows (one per scenario)

Criterion-validity correlation (Spearman + Pearson + 2,000-draw bootstrap CI) between each named scenario's score and `modeled_ed_rate_per_1000`, closing RISK-015 (DEC-055). Same shape and tautology-guard discipline as `analytics.correlation_diagnostics` (Phase 4). All 8 rows `is_tautological=false`, live-verified.

### `meta.audit_runs` (row count varies by build — 258 rows as of the Phase 7 commit)

Every `make audit` check's `(suite, check_name, passed, message)`, tagged with a single `run_at` timestamp per invocation (replaced, not appended, on each run — DEC-059). Powers `GET /api/v1/validate/audit-status` without the API importing the pipeline package.

## Versioning

This file's structure is versioned alongside the metric registry (`config/metrics.yml`). Material changes to a metric's definition, source, or geography require a new metric ID version suffix and a changelog entry here, not a silent in-place edit — per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Governance for scores and models."
