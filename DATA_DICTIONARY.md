# DATA_DICTIONARY.md

**Status: skeleton (Phase 0).** This document is populated incrementally as each source adapter and metric is implemented (Phase 3–4). It is the human-readable companion to `config/metrics.yml` (machine-readable, authoritative for scoring/UI) and `DATA_MANIFEST.json` (machine-readable, authoritative for provenance). No metric may appear in the product before it has an entry here.

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

## Geography dimension tables (Phase 2)

- `geo.tracts` (2020 Census tract, canonical)
- `geo.zctas`
- `geo.places` (cities)
- `geo.supervisor_districts`
- `geo.crosswalk_zip_tract` (Census ZCTA-relationship default + optional HUD enhancement, per DEC-005)
- `geo.hpsa_mua` (HPSA/MUA/P designation areas)

## Resource dimension tables (Phase 3/6)

- `resources.facilities` (HCAI licensed facilities, HRSA health centers, deduplicated)
- `resources.transit_stops` (VTA GTFS)
- `resources.food_resources` (USDA SNAP retailers)
- `resources.community_resources` (SCC GIS Hub public assets)

## Versioning

This file's structure is versioned alongside the metric registry (`config/metrics.yml`). Material changes to a metric's definition, source, or geography require a new metric ID version suffix and a changelog entry here, not a silent in-place edit — per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Governance for scores and models."
