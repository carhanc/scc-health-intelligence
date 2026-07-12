# MODEL_CARD.md — Santa Clara Health Intelligence

**Status: scoring/uncertainty/sensitivity/preliminary-validation populated (Phase 4).** Full independent validation (Phase 7), fairness review (Phase 10), and final finalization (Phase 11) remain pending.

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

**Scenarios (7 + 1 default, `config/scenarios.yml`):** `default_integrated_screen_v1`, `diabetes_prevention_v1`, `mobile_transit_care_v1`, `coverage_navigation_v1`, `older_adult_support_v1`, `behavioral_health_access_v1`, `food_access_v1` — each a versioned weight configuration over the 5 domains, with `required_metrics` and `minimum_confidence` validated against the metric registry at pipeline-run time and audit time.

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
- **Location-allocation optimization (docs §13, `optimization/location_allocation.py`):** OR-Tools CP-SAT maximal-covering-location model, real VTA high-frequency transit-stop candidates (DEC-034), `health_burden`-weighted demand, optional equity constraint (minimum high-need-tract coverage fraction). 3 real solved scenarios persisted in `analytics.optimization_runs`, including one correctly-INFEASIBLE result (k=10 sites at a 1-mile threshold cannot satisfy a 50% high-need-coverage equity constraint) — surfaced transparently, not hidden. Every result's `assumptions` field states explicitly that coverage is a modeled scenario, never a forecast of avoided ED visits, dollars saved, or health outcomes.

## Validation results (preliminary, Phase 4; full independent validation Phase 7)

**Tautology guard (docs §15.1, `validation/tautology_guard.py`):** every correlation check is screened before computation — an outcome that is itself a scenario's component metric (by metric_id or by identical underlying source_table/source_field) is refused outright, not merely flagged after computing a misleading number. Verified with both a positive case (the canonical "diabetes-priority score correlated with diabetes prevalence" example from docs §15.1) and negative cases (5 unit tests, `test_tautology_guard.py`), and confirmed live: all 7 persisted `analytics.correlation_diagnostics` rows have `is_tautological = false`.

**Convergent-validity check (docs §15.2, `validation/correlation_diagnostics.py`):** each of the 7 scenarios' scores were tested (Spearman rank correlation + 2,000-draw bootstrap 95% CI) against CDC/ATSDR SVI's overall percentile ranking (`RPL_THEMES`, n=408 tracts, an independent index never used as a metric-registry input). Results (live, 2026-07-12): `default_integrated_screen_v1` r=0.76, `diabetes_prevention_v1` r=0.76, `mobile_transit_care_v1` r=0.66, `coverage_navigation_v1` r=0.81, `older_adult_support_v1` r=0.66, `behavioral_health_access_v1` r=0.77, `food_access_v1` r=0.72 — all moderate-to-strong positive correlations, consistent with (but not proof of) face validity, since SVI and these scenarios draw on conceptually related but non-identical inputs. **This is convergent validity only, not criterion validity, and not causal evidence** — a correlation with a related index shows the scenario scores broadly agree with an established measure of social vulnerability, nothing more.

**Criterion validity (against an independent outcome, e.g. HCAI ED utilization) is not yet computed** — DEC-023/DEC-033 document why: HCAI's ED patient-county data has Santa Clara County as its only row (n=1), which is statistically undefined for correlation. A genuine tract-level utilization outcome requires crosswalking ZIP-level patient-origin data through the ZCTA-tract relationship, reserved for Phase 7 (RISK-015).

## Fairness considerations (populated Phase 10)

_Pending implementation._ Will document the pre-release equity review required by `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`: whether missing data correlate with race/ethnicity/income/language/rurality, whether resource inventories undercount informal/community-based services, whether county-relative ranks obscure countywide need, and who is deprioritized under each scenario lens.

## Update process

Material changes to inputs, weights, geography, or methods require a new score/model version and a migration note in `DECISIONS.md` and `CHANGELOG.md` — historical outputs are never silently updated in place.

## Limitations

_Populated continuously as each phase surfaces concrete limitations; finalized in Phase 11._

**From Phase 0:** PLACES estimates are modeled small-area estimates, not direct tract surveys; ZIP-to-tract crosswalks introduce allocation uncertainty; HCAI ambulatory-surgery market share excludes physician-owned clinics by design; CalEnviroScreen 5.0 scores are not comparable to 4.0-era scores; NPPES-derived provider density (if used) reflects administrative enumeration, not appointment availability or active practice status.

**From Phase 4:**

- No tract-level ED utilization pressure domain exists; HCAI ED data (Phase 3) is native to county of residence with Santa Clara as the only county present, making tract-level allocation or independent-outcome correlation statistically ungrounded without a further crosswalk (Phase 7, DEC-023/RISK-015).
- `resource_accessibility` and `workforce_shortage` use straight-line ("as the crow flies") distance, not real network travel time; this systematically understates true travel burden, especially where road networks are indirect (DEC-024/RISK-016).
- `access_barriers` has no language/navigation subdomain — no ACS language-isolation table was ingested in Phase 3 (DEC-027).
- `hpsa_proximity_score` reflects only 39 of 148 Santa Clara County HPSA records (Designated, coordinate-bearing only); the remaining 109 lack usable point geometry or active status (DEC-026/RISK-017).
- `acs_disability_rate`'s combined margin of error across its 12-line sum is not computed; this metric carries no uncertainty figure rather than an unverified approximation (DEC-031/RISK-018).
- Facility candidate sites for the location-allocation optimizer (VTA transit stops) are not deduplicated against each other or against the `resource_accessibility` candidate pool (HCAI + HRSA facilities) — Phase 6 scope.
- Convergent-validity correlation (vs. CDC/ATSDR SVI) is not causal evidence and does not establish that any scenario's priority screen "works" as an intervention-targeting tool; a genuine independent-outcome (criterion-validity) check is Phase 7 scope.
- Scenario scores, domain scores, and all uncertainty/sensitivity results currently exist only in the live warehouse — there is no offline demo snapshot for Phase 4 analytics yet (DEC-035/RISK-019).

## Contact / contribution path

_Pending — to be finalized in Phase 11 alongside `DELIVERY_REPORT.md` and the contributor guide._
