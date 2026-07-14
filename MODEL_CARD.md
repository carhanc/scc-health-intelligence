# MODEL_CARD.md — Santa Clara Health Intelligence

**Status: scoring/uncertainty/sensitivity populated (Phase 4); independent (criterion) validation against modeled ED utilization, Prioritize/Utilization/Validate pages added (Phase 7).** Fairness review (Phase 10) and final finalization (Phase 11) remain pending.

## Intended users

Health Advisory Commissioners, county/health-system analysts, community advocates and nonprofit leaders, researchers/students, and the general public — see `docs/00_PRODUCT_CHARTER.md` §5 for full persona detail.

## Intended uses

- Exploratory public-health analysis of Santa Clara County neighborhood conditions.
- Advocacy and public-meeting preparation (staff questions, briefs, public-comment outlines).
- Public-data prioritization screening to identify geographies warranting deeper review.
- Transparent, assumption-explicit intervention-scenario comparison (e.g., mobile-clinic siting).
- Research hypothesis generation and reproducible methods inspection.
- Monitoring public indicator trends where source comparability allows it.

## Prohibited / unsupported uses

Per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Responsible analytics governance": this platform must **not** be used for individual diagnosis or treatment, individual eligibility decisions, individual risk prediction, emergency response dispatch, automatic allocation of public funds, automatic facility closure/placement decisions, punitive action against communities or providers, causal claims about program impact without a validated causal design, identifying individuals, or replacing community engagement or professional judgment.

## Data sources

Full registry: `docs/data/source-verification.md`. Summary: CDC PLACES 2025, ACS 2020–2024 5-year, Census TIGER/Line 2020, CDC/ATSDR SVI 2022, California HPI 3.0, CalEnviroScreen 5.0 (final), HCAI facility/ED/patient-origin data, HRSA health-center and HPSA/MUA data, VTA GTFS, Santa Clara County GIS Hub, USDA SNAP retailers, Census/HUD ZIP-tract crosswalks, county meeting documents (user-uploaded).

## Geography

Canonical unit: 2020 Census tract (Santa Clara County, FIPS `06085`), 11-character string GEOID. Supplementary geographies: ZCTA, city/place, supervisor district, HPSA/MUA/P areas. Native source geography always retained alongside canonical crosswalks — never discarded (see `PLAN.md` §4).

## Scoring method (Phase 4)

**Domains (5, tract-level):** `health_burden` (CDC PLACES; subdomains cardiometabolic, mental_health, functional_physical, behavior_risk), `access_barriers` (CDC PLACES social-needs measures + ACS 2020-2024 5-year; subdomains affordability_coverage, mobility, functional_access, material_hardship — no `language_navigation` subdomain, DEC-027), `environmental_burden` (CalEnviroScreen 5.0; subdomains pollution_burden, population_vulnerability), `resource_accessibility` (straight-line distance to nearest clinical-care site, DEC-024), `workforce_shortage` (HRSA MUA/P direct tract join + HPSA straight-line proximity, DEC-025/DEC-026). No tract-level `ed_utilization_pressure` domain exists (DEC-023) — HCAI ED data is native to county of residence and Santa Clara is the only county present.

**Metric registry:** `config/metrics.yml`, 25 metrics, machine-readable, drives every score and label (docs/03 §3). Each entry: metric_id, label, domain, subdomain, source_id/table/field, unit, direction, transform, uncertainty_type, minimum_coverage, plain-language definition, interpretation, limitations, citation.

**Aggregation (equal subdomain weighting, docs §6.1):** metric → county-relative concern percentile (0-100, average-rank ties) → subdomain score (mean of present metric percentiles) → domain score (mean of present subdomain scores, valid only if ≥70% of subdomains present, else `NULL` — never zero-filled) → scenario score (weighted mean of present domain scores, weights renormalized over present domains, coverage_fraction disclosed). `pipelines/tests/test_domain_scores.py` and `test_scenario_scores.py` hand-verify this cascade against known inputs; `pipelines/tests/test_explainability.py` and `apps/api/tests/test_analytics_routes.py::test_explain_score_for_top_ranked_tract` verify that individual metric contributions sum exactly back to the scenario score, both in isolated unit fixtures and against all 66,504 live `analytics.metric_contributions` rows (`analytics_audits.py::_audit_contributions_sum_to_scenario_score`).

**Scenarios (8 named + custom, `config/scenarios.yml`):** `default_integrated_screen_v1`, `diabetes_prevention_v1`, `mobile_transit_care_v1`, `coverage_navigation_v1`, `older_adult_support_v1`, `behavioral_health_access_v1`, `food_access_v1`, `environmental_burden_priority_v1` (added Phase 7, DEC-057) — each a versioned weight configuration over the 5 domains, with `required_metrics` and `minimum_confidence` validated against the metric registry at pipeline-run time and audit time. Phase 7's Prioritize page also accepts an arbitrary user-supplied "custom" weight vector, computed on demand by a dependency-isolated duplicate of this same aggregation formula (`apps/api/.../services/custom_scenario_scoring.py`, DEC-058) — never a second, divergent methodology. A "Language access" priority lens was deliberately NOT built, since no tract-level language-barrier metric exists to weight (DEC-027/DEC-057); shown in the Prioritize UI as a genuinely unavailable option with a stated reason, not silently omitted or faked.

**Explicit statement:** every domain/scenario score is a **county-relative priority-screening score** (0-100 percentile among Santa Clara County's 408 tracts under a specific, disclosed weight configuration) — not an absolute clinical threshold, not a probability of any outcome, and not an objective ranking of "true need." This sentence is repeated verbatim in every recommendation's `assumptions` field (`/api/v1/scenarios/{id}/recommendations`).

## Uncertainty (Phase 4)

- **ACS estimates:** `standard_error = MOE_90 / 1.645` (docs §8.1), plus a documented relative-MOE approximation for two-term ratio metrics (`acs_poverty_rate`); the 12-term-sum `acs_disability_rate` metric explicitly carries `uncertainty_type: "none"` rather than an unverified approximation (DEC-031, RISK-018).
- **PLACES estimates:** `standard_error ≈ (upper - lower) / (2 * 1.96)` from the published 95% confidence limits (docs §8.2), implemented in `pipelines/src/scc_health_pipeline/uncertainty/moe.py` (Phase 3, 9 hand-calculated unit tests).
- **Monte Carlo score uncertainty (docs §8.3):** `uncertainty/monte_carlo.py`, 500 draws per scenario, deterministic seed 42 (`np.random.default_rng`, sequential consumption over a fixed sorted tract/metric iteration order — DEC-029). Each draw perturbs every metric with a real standard error via a bounded normal distribution (clipped to `[0, 100]` for percentages, `[0, ∞)` for distances), recomputes the full metric→domain→scenario cascade, and records median score, 10th-90th percentile interval, median rank, rank interval, and probability of top-decile/top-quartile status. Reproducibility (identical seed → bit-identical output) is directly unit-tested (`test_monte_carlo.py::test_monte_carlo_reproducible_under_fixed_seed`) and verified live: `analytics.monte_carlo_results` persists `seed`/`n_draws` on every row.
- **Data confidence (docs §8.4, `scoring/data_confidence.py`):** `confidence = 0.35·coverage + 0.30·precision + 0.20·geography_quality + 0.15·freshness_source`, each component independently visible (never collapsed into one opaque number). `precision_component` reflects the fraction of contributing metrics carrying real uncertainty; `geography_quality_component` scores straight-line-screening metrics 0.7 vs. 1.0 for native/direct ones; `freshness_source_component` reuses the Phase 3 vintage classifier (`audits/vintage_audits.py::classify_entry`) against each metric's underlying manifest source. Confidence is a separate reliability signal, never treated as need (docs §4.7) — it does not suppress a high-scoring tract, only annotates it.

## Sensitivity (Phase 4)

- **Preset sensitivity (docs §9.1, `scoring/sensitivity.py::compute_preset_sensitivity`):** 5 named global weight configurations — `balanced`, `need_first`, `access_first`, `resource_first`, `systemic_pressure_first` (renamed from docs' "utilization-first," DEC-028, since no tract-level utilization domain exists). Scenario-independent (the same 5 presets apply regardless of which named scenario a user starts from, since they fully replace the scenario's own weights) — persisted once in `analytics.preset_scenario_scores` (2,040 rows: 5 presets × 408 tracts).
- **Random-weight (Dirichlet) sensitivity (docs §9.2, `scoring/sensitivity.py::compute_weight_sensitivity`):** 1,000 draws per scenario from a symmetric Dirichlet(1,...,1) distribution over that scenario's own weighted domains, deterministic seed 42. Reports median rank, 10th-90th rank interval, rank standard deviation, probability of top-decile/top-quartile status, and the "most influential domain" (the domain whose sampled weight has the highest absolute Pearson correlation with the tract's score across draws — a standard one-at-a-time sensitivity-attribution technique, hand-verified in `test_sensitivity.py::test_weight_sensitivity_most_influential_domain_identifies_dominant_driver`).
- **Stability labels (docs §9.3, `scoring/sensitivity.py::classify_stability`):** combines the Dirichlet weight-sensitivity's `probability_top_decile` with the `data_confidence` score into exactly one of 4 canonical labels — **Robust** (≥75% top-decile probability, sufficient data confidence), **Moderately stable** (≥40%), **Assumption-sensitive** (<40%), **Data-limited** (confidence_score < 0.40, overriding an otherwise-high weight-stability result). Never described as a probability of real-world intervention success (docs §9.3's explicit prohibition) — the label characterizes how much a tract's *priority conclusion* depends on weighting choice and data completeness, nothing more.

## Decision-engine capabilities (Phase 4)

- **Explainability (docs §10):** every score decomposes to component domains, component metrics, raw value + unit, county percentile, weight, contribution, uncertainty, source/vintage, missing components, and a `scenario_config_hash` (SHA-256 of the scenario's weight configuration, stable and order-independent) — served via `GET /api/v1/scenarios/{id}/tracts/{tract}/explain`.
- **Score-decomposition counterfactual (docs §10.2, `scoring/explainability.py::score_decomposition_counterfactual`):** "if this tract's [domain] were set to the county median, its score would move from X to Y" — implemented and unit-tested, explicitly labeled "score decomposition," never "expected intervention impact."
- **Structured recommendations (`scoring/recommendations.py`, `GET /api/v1/scenarios/{id}/recommendations`):** ranked tract list, each entry exposing contributing metrics, effective weights, uncertainty, explicit assumptions (including a straight-line-distance disclosure where relevant), per-metric limitations, supporting evidence (raw value/unit/percentile/citation per metric), and deduplicated source provenance — nothing is asserted without an attached, inspectable reason.
- **Location-allocation optimization (docs §13, `optimization/location_allocation.py`):** OR-Tools CP-SAT maximal-covering-location model, real VTA high-frequency transit-stop candidates (DEC-034), `health_burden`-weighted demand, optional equity constraint (minimum high-need-tract coverage fraction). Phase 6 extended this to real population-weighted demand, layered/disclosed distance methods, and explicitly-labeled candidate-site types (DEC-049) — see "Access Lab capabilities" below. 6 real solved scenarios persisted in `analytics.optimization_runs` (extended from 3), including one correctly-INFEASIBLE result (k=10 sites at a 1-mile threshold cannot satisfy a 50% high-need-coverage equity constraint) — surfaced transparently, not hidden. Every result's `assumptions` field states explicitly that coverage is a modeled scenario, never a forecast of avoided ED visits, dollars saved, or health outcomes.

## Access Lab capabilities (Phase 6)

- **Canonical resource inventory** (`resources/canonicalize.py`): 4,207 deduplicated facilities (15 hospitals, 155 clinics, 796 food retailers, 3,241 transit hubs) cross-matched across HCAI, HRSA, SCC Public Health, USDA SNAP, and VTA GTFS sources. Geographic proximity alone never merges two records (tested and audited) — see `docs/methods/accessibility.md` §2.
- **Real network routing** (`routing/network_osm.py`, docs §11's `OSMNetworkProvider`): live-downloaded, cached Santa Clara County OSM walk (277,444 nodes) and drive (45,836 nodes) graphs. Every distance/duration result carries a `method` label distinct from straight-line screening. See `docs/methods/routing.md`.
- **Scheduled-transit access** (`routing/transit_access.py`): real GTFS weekday-daytime headway per stop, walk-linked via the real network graph, always labeled `scheduled_transit_access_proxy` — never presented as real-time. See `docs/methods/transit-access.md`.
- **E2SFCA catchment accessibility** (`analytics/e2sfca.py`, docs §12.5): Gaussian-decay two-step formula, real HCAI licensed-bed capacity for hospitals, disclosed facility-count proxy for clinics, never mixed within a category. See `docs/methods/e2sfca.md`.
- **Resource-gap classification** (`analytics/resource_gap.py`): county-relative tercile overlap of estimated health need and measured access, plus a cross-variant stability assessment (stable vs. assumption-sensitive) — an association/overlap label, never a causal claim. See `docs/methods/accessibility.md` §5.
- **Access Lab API and UI**: `/api/v1/access/*` (facilities, network access, transit access, E2SFCA, resource gaps, optimizer scenarios) and `/access-lab` (tract search, travel-mode selector, 4-tab interface). See `docs/user-guide/access-lab.md`.

## Utilization capabilities (Phase 7)

- **Observed HCAI emergency-department data, at native geography** (`utilization.hcai_ed_patient_county` — county, 796 rows, 2008-2024 real time series; `utilization.hcai_ed_facility_profile` — 9 Santa Clara facilities, 2024, payer/disposition/language/diagnosis breakdowns; `utilization.hcai_patient_origin` — patient ZIP, 31,462 rows, 2024). Never re-aggregated to a finer geography than the source actually reports; suppressed cells preserved as null, never zero.
- **Modeled tract-level allocation** (`utilization/zip_to_tract_allocation.py`, DEC-055): real ZIP-level observed ED encounters allocated to tracts via the audited `geo.crosswalk_zip_tract` area weights, persisted in `analytics.utilization_ed_tract_modeled`/`utilization_access_vs_utilization` with `data_status="modeled"` on every row and its own `method`/`crosswalk_quality` fields — visually and analytically distinct from the observed tables.
- **Reliability flag for area-weighting outliers** (DEC-056): a tract-level rate above a disclosed plausibility ceiling (1,000 modeled ED visits per 1,000 residents) is flagged `rate_reliability="low_reliability"` with an explanatory note (16 of 408 tracts, live-measured) — never presented as an ordinary modeled value.
- **Facility, geographic, and trends-over-time views** (`/api/v1/utilization/*`, `/utilization`): payer mix, disposition, language breakdown per facility; ranked tract-level modeled utilization with a client-computed "high modeled use" percentile flag (excludes low-reliability tracts from its own threshold computation); real 2008-2024 county trend lines by disposition/race/sex/payer. Capacity (`licensed_bed_band`) and demand (`total_ed_encounters`) are shown side by side as a factual comparison, explicitly never labeled occupancy or over-capacity, since no public data reports actual bed-day usage.

## Advocacy evidence and Copilot capabilities (Phase 8)

- **Advocacy evidence assembly** (`advocacy_evidence.py`): a read-only presentation layer over already-computed `analytics.*`/`resources.*` tables (DEC-030 boundary preserved) — no score, percentile, or access figure is recomputed for advocacy use. Every returned `EvidenceItem` carries its own publisher, vintage, retrieval time, method, uncertainty note, limitation, and citation.
- **City/ZIP/supervisor-district evidence is a disclosed unweighted average across member tracts**, never presented as a single tract's real figure (DEC-061/RISK-030). A geography that resolves to zero member tracts returns no evidence at all, never a county-wide fallback (DEC-062).
- **Document Intelligence** (`document_intelligence.py`): validated, in-memory-only extraction (PDF/DOCX/TXT/Markdown) and rule-based structure/topic/geography detection against `config/topic_ontology.yml`'s versioned mapping to real platform metrics/scenarios/resource categories. Never invents a topic mapping to something unscored — "language access" is disclosed as unavailable, matching DEC-027/DEC-057's precedent.
- **Deterministic advocacy generation** (`advocacy_generation.py`): rules/templates over already-cited evidence, zero AI calls, always available. Every generated brief includes an explicit non-causal disclaimer and a reproducible configuration hash.
- **Copilot, two modes behind one interface** (DEC-063): `DeterministicProvider` reuses the exact same generation functions as Advocate's brief builder (never a second, divergent implementation); `AnthropicProvider` is server-side-only, active only when `ANTHROPIC_API_KEY` is configured, and every response is validated post-generation so a claimed citation to evidence it was never given is silently discarded, never surfaced (DEC-064).

## Validation results (Phase 4 convergent validity; Phase 7 criterion validity)

**Tautology guard (docs §15.1, `validation/tautology_guard.py`):** every correlation check is screened before computation — an outcome that is itself a scenario's component metric (by metric_id or by identical underlying source_table/source_field) is refused outright, not merely flagged after computing a misleading number. Verified with both a positive case (the canonical "diabetes-priority score correlated with diabetes prevalence" example from docs §15.1) and negative cases (5 unit tests, `test_tautology_guard.py`), and confirmed live: all 8 persisted `analytics.correlation_diagnostics` rows and all 8 `analytics.utilization_criterion_validity` rows have `is_tautological = false`.

**Convergent-validity check (docs §15.2, `validation/correlation_diagnostics.py`):** each of the 8 scenarios' scores were tested (Spearman rank correlation + 2,000-draw bootstrap 95% CI) against CDC/ATSDR SVI's overall percentile ranking (`RPL_THEMES`, n=408 tracts, an independent index never used as a metric-registry input). Results (live, 2026-07-13): `default_integrated_screen_v1` r=0.76, `diabetes_prevention_v1` r=0.76, `mobile_transit_care_v1` r=0.66, `coverage_navigation_v1` r=0.81, `older_adult_support_v1` r=0.66, `behavioral_health_access_v1` r=0.77, `food_access_v1` r=0.72, `environmental_burden_priority_v1` r=0.86 — all moderate-to-strong positive correlations, consistent with (but not proof of) face validity, since SVI and these scenarios draw on conceptually related but non-identical inputs. **This is convergent validity only, not criterion validity, and not causal evidence** — a correlation with a related index shows the scenario scores broadly agree with an established measure of social vulnerability, nothing more.

**Criterion validity (against modeled ED utilization, closing RISK-015, DEC-055):** each of the 8 scenarios' scores were tested against the new modeled tract-level ED visit rate per 1,000 residents (`analytics.utilization_access_vs_utilization.modeled_ed_rate_per_1000`, an independent outcome never used as a metric-registry input, n=408). Results (live, 2026-07-13): `default_integrated_screen_v1` r=0.36, `diabetes_prevention_v1` r=0.32, `mobile_transit_care_v1` r=0.34, `coverage_navigation_v1` r=0.29, `older_adult_support_v1` r=0.34, `behavioral_health_access_v1` r=0.37, `food_access_v1` r=0.27, `environmental_burden_priority_v1` r=0.30 — moderate positive correlations, weaker than the convergent-validity (SVI) check, consistent with what a defensible screening tool checked against a noisier, allocation-derived outcome should show. **This is criterion validity against a modeled (not directly observed) outcome, and not causal evidence** — see the Utilization capabilities section above for the outcome's own disclosed allocation limitations.

## Fairness considerations (populated Phase 10)

_Pending implementation._ Will document the pre-release equity review required by `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`: whether missing data correlate with race/ethnicity/income/language/rurality, whether resource inventories undercount informal/community-based services, whether county-relative ranks obscure countywide need, and who is deprioritized under each scenario lens.

## Update process

Material changes to inputs, weights, geography, or methods require a new score/model version and a migration note in `DECISIONS.md` and `CHANGELOG.md` — historical outputs are never silently updated in place.

## Limitations

_Populated continuously as each phase surfaces concrete limitations; finalized in Phase 11._

**From Phase 0:** PLACES estimates are modeled small-area estimates, not direct tract surveys; ZIP-to-tract crosswalks introduce allocation uncertainty; HCAI ambulatory-surgery market share excludes physician-owned clinics by design; CalEnviroScreen 5.0 scores are not comparable to 4.0-era scores; NPPES-derived provider density (if used) reflects administrative enumeration, not appointment availability or active practice status.

**From Phase 4:**

- `resource_accessibility` and `workforce_shortage` use straight-line ("as the crow flies") distance, not real network travel time; this systematically understates true travel burden, especially where road networks are indirect (DEC-024/RISK-016).
- `access_barriers` has no language/navigation subdomain — no ACS language-isolation table was ingested in Phase 3 (DEC-027); Phase 7 deliberately did not build a "Language access" priority scenario as a workaround (DEC-057).
- `hpsa_proximity_score` reflects only 39 of 148 Santa Clara County HPSA records (Designated, coordinate-bearing only); the remaining 109 lack usable point geometry or active status (DEC-026/RISK-017).
- `acs_disability_rate`'s combined margin of error across its 12-line sum is not computed; this metric carries no uncertainty figure rather than an unverified approximation (DEC-031/RISK-018).
- Facility candidate sites for the location-allocation optimizer (VTA transit stops) are not deduplicated against each other or against the `resource_accessibility` candidate pool (HCAI + HRSA facilities) — Phase 6 scope.
- Convergent-validity correlation (vs. CDC/ATSDR SVI) is not causal evidence and does not establish that any scenario's priority screen "works" as an intervention-targeting tool.
- Scenario scores, domain scores, and all uncertainty/sensitivity results currently exist only in the live warehouse — there is no offline demo snapshot for Phase 4 analytics yet (DEC-035/RISK-019).

**From Phase 7:**

- Tract-level ED utilization is a modeled ZIP-to-tract area-weighted allocation, never a directly observed tract-level count — HCAI does not publish ED data below ZIP/facility/county geography (DEC-055). A small number of large, sparsely-populated tracts produce an unreliable allocation, flagged `rate_reliability="low_reliability"` rather than presented as ordinary (DEC-056/RISK-027).
- Criterion validity against modeled ED utilization is evidence of association with a noisier, allocation-derived outcome, not a directly-observed one, and not causal evidence.
- Two named scenarios (`mobile_transit_care_v1`, `older_adult_support_v1`) currently produce identical rankings, since both fall back to the same generic access/resource proxies for real, distinct data gaps each already discloses in its own `notes` (RISK-028).
- A custom Prioritize weighting shows a point-in-time combined score only — Monte Carlo uncertainty ranges, stability labels, and preset-sensitivity comparisons are precomputed only for the 8 named scenarios, not for arbitrary user-supplied weight vectors.
- Prioritize's "site & program constraints" reuses the same 6 precomputed Access Lab mobile-clinic siting scenarios (RISK-016/RISK-024's limitations apply identically) rather than exposing live, freely-parameterized optimizer solving (DEC-022/DEC-051/DEC-060).
- `analytics.utilization_*` tables exist only in the live warehouse — no offline demo snapshot yet, matching the same disclosed gap as Phase 4 `analytics.*` (RISK-029).

**From Phase 8:**

- Advocacy evidence for a city, ZIP, or supervisor district is an unweighted average across member tracts, not population-weighted — a large, sparsely-populated tract and a small, dense one currently count equally (DEC-061/RISK-030).
- DOCX advocacy export is not implemented; print-to-PDF and CSV are the two supported export paths this phase (DEC-065/RISK-031).
- AI-assisted Copilot mode has structural safety controls (evidence-only citation, post-generation citation validation) that are unit-tested, but no golden-evaluation set or live-model adversarial red-team pass has been run against it (RISK-032) — relevant only to a deployment that configures `ANTHROPIC_API_KEY`; the default, zero-configuration deterministic mode is unaffected.
- Document Intelligence's structure/geography/topic detection is deliberately simple, disclosed regex/keyword matching, not a general document-understanding model — it will miss unusual phrasings, and PDF extraction does not perform OCR on scanned-image-only pages (see `docs/methods/document-intelligence.md` §7).

**From Phase 6:**

- Scheduled-transit access is a schedule-based proxy (published weekday-daytime headway), not real-time arrivals, transfers, or in-vehicle travel time to a specific destination (RISK-021).
- Driving distances assume free-flow speed with no time-of-day or traffic-congestion modeling (RISK-024).
- Libraries, community centers, senior centers, and pharmacies are not represented in the canonical facility inventory — no verified official bulk source was reachable this session; documented as an unavailable category, not fabricated (DEC-045, RISK-022).
- Resource deduplication uses anchor-based (not fully pairwise) group formation — a theoretical over-merge risk, spot-checked as plausible on live data but not exhaustively verified (RISK-023).
- E2SFCA and resource-gap results are association/overlap measures, not causal — a "priority gap" classification never implies that low measured access causes worse health outcomes, or that adding a resource would change them.
- The Access Lab resource browser has no custom map visualization this session, only an accessible sortable table (RISK-025) — the table satisfies the accessibility requirement independently; a map is a legitimate future enhancement.
- `analytics.{network_access_metrics,transit_access_metrics,e2sfca_accessibility}` are precomputed batch tables (a full county run takes ~59 minutes) with no offline demo snapshot yet, matching the same disclosed gap pattern as Phase 4's `analytics.*` tables.

## Contact / contribution path

_Pending — to be finalized in Phase 11 alongside `DELIVERY_REPORT.md` and the contributor guide._
