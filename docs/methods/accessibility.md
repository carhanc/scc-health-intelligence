# Accessibility Methodology (Phase 6 Access Lab)

Status: Phase 6, implemented and audited. This document explains how the Access Lab's resource inventory, population origins, and access measures fit together. Each individual method (network routing, transit, E2SFCA, optimization) has its own document in this directory; this page is the map between them.

## 1. The three layers of Access Lab data

Every number in the Access Lab is one of three kinds, and the UI and API never blur the distinction between them:

1. **Observed** — real, published facts: a facility's location and attributes (`resources.canonical_facilities`), a population count (`geo.block_group_population_origins`), a scheduled GTFS departure time.
2. **Modeled** — a computed estimate built from observed data plus a stated method: a real network-routed walking/driving distance, an E2SFCA accessibility score, a resource-gap classification. Modeled values always carry a `method` field.
3. **Hypothetical** — a proposed, not-yet-real scenario: an `abstract_analytical` optimizer candidate site, a mobile-service siting scenario. Hypothetical values are always labeled as planning exploration, never a decided plan or guaranteed outcome.

## 2. Canonical resource inventory

`resources.canonical_facilities` (4,207 rows: 15 hospitals, 155 clinics, 796 SNAP food retailers, 3,241 transit stops) is the deduplicated, cross-source-matched facility list every downstream Access Lab computation uses. See `docs/methods/../../DECISIONS.md` DEC-045 (which categories are covered vs. documented as unavailable — libraries, community centers, senior centers, and pharmacies, RISK-022) and the module docstring in `pipelines/src/scc_health_pipeline/resources/canonicalize.py` for the full deduplication method (tier-1 exact name+address match, tier-2 spatial-proximity-AND-name-similarity fallback — proximity alone never merges two records, tested and audited).

## 3. Population-weighted origins

`geo.block_group_population_origins` (1,173 rows) is the real-world starting point for every distance/time computation — the U.S. Census Bureau's own 2020 Mean Center of Population file (DEC-044), not a tract geometric centroid and not a self-computed weighting. Every tract has at least one origin (audited); origins' total population reconciles with the independent ACS B01003 total within 1.8% (audited, `audits/resource_canonicalization_audits.py`).

## 4. What each measure answers

| Question | Method | Document |
|---|---|---|
| How far is the nearest hospital/clinic by real streets? | Real OSM network routing (walk + drive) | `routing.md` |
| How reachable is a scheduled bus/light-rail stop? | GTFS weekday-daytime headway + real walk routing | `transit-access.md` |
| How does access considering both nearby services *and* local demand compare across the county? | E2SFCA (Enhanced Two-Step Floating Catchment Area) | `e2sfca.md` |
| Where do high estimated need and low measured access overlap? | County-relative tercile classification | this document, §5 |
| Where might a new mobile-service site help the most people? | OR-Tools maximal-covering-location optimizer | `optimization.md` |

## 5. Resource-gap classification

`pipelines/src/scc_health_pipeline/analytics/resource_gap.py` (and its dependency-free API-layer duplicate, `apps/api/src/scc_health_api/services/resource_gap.py` — DEC-051) classifies each tract into one of four labels by comparing its county-relative health-burden percentile (Phase 4's `analytics.domain_scores`, `health_burden` domain) against its county-relative E2SFCA accessibility percentile:

- **priority_gap** — top-tercile need, bottom-tercile access.
- **need_met** — top-tercile need, top-tercile access.
- **low_priority** — bottom-tercile need, bottom-tercile access.
- **well_served** — bottom-tercile need, top-tercile access.

A tract in neither tercile on an axis (the middle third) is classified by a median-split fallback so every tract gets one of the four labels, never a fifth "ambiguous" bucket. This is an **association/overlap classification, never a causal claim** — per this project's non-negotiable rule, "priority_gap" means the two percentiles both fall in the flagged range, nothing about why, and nothing about whether adding a resource would change either one. Computed on demand by the API from two already-materialized score columns (DEC-050), not a separate batch table, to avoid a third copy of the data drifting out of sync with either source.

### Stability across assumptions

`assess_gap_stability()` compares a tract's classification across several methodological variants (e.g. walk-mode vs. drive-mode E2SFCA) and labels each tract `stable` (agrees across every variant it appears in) or `assumption_sensitive` (does not) — directly answering "which service gaps are stable vs. assumption-sensitive," one of this phase's explicit questions.

## 6. Known limitations (see RISK_REGISTER.md for full detail)

- RISK-021: scheduled-transit access is a schedule-based proxy, not real-time or door-to-door.
- RISK-022: libraries, community centers, senior centers, and pharmacies have no verified official bulk source this session — not fabricated, documented as unavailable.
- RISK-023: resource deduplication uses anchor-based (not fully pairwise) group formation.
- RISK-024: driving distances assume free-flow speed, no traffic congestion modeling.
- RISK-025: no custom map layer for the resource browser this session (accessible table only).
