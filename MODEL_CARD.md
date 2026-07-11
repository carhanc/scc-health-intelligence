# MODEL_CARD.md — Santa Clara Health Intelligence

**Status: skeleton (Phase 0).** Populated fully as domain scores, scenario lenses, uncertainty methods, and validation results are implemented (Phase 4, 7) and finalized at Phase 11.

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

## Scoring method (populated Phase 4)

_Pending implementation._ Will document: domain list and subdomain grouping, equal-weighting rationale, coverage thresholds, scenario-lens weight configurations (`config/scenarios.yml`), exact formula and version string per score, and the explicit statement that scenario/priority scores are county-relative screening tools, not objective truth scores or probabilities.

## Uncertainty (populated Phase 4)

_Pending implementation._ Will document: ACS MOE→SE conversion, PLACES CI→SE conversion, Monte Carlo propagation method and deterministic seed, rank/percentile interval construction, top-decile-inclusion-probability method.

## Sensitivity (populated Phase 4)

_Pending implementation._ Will document: the five named weight presets, Dirichlet random-weight sampling parameters, and the exact criteria behind each rank-stability label (Robust / Moderately stable / Assumption-sensitive / Data-limited).

## Validation results (populated Phase 7)

_Pending implementation._ Will document every pre-registered validation hypothesis, the independent outcome used, method, result with uncertainty, spatial diagnostics, and an honest interpretation statement — including null and contradictory findings, which will be given equal visual weight to positive findings. No validation record may reuse a score's own input metric as the "independent" outcome (enforced by the tautology-guard audit, see `PLAN.md` §11 and `RISK_REGISTER.md` RISK-002/§Phase 4).

## Fairness considerations (populated Phase 10)

_Pending implementation._ Will document the pre-release equity review required by `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`: whether missing data correlate with race/ethnicity/income/language/rurality, whether resource inventories undercount informal/community-based services, whether county-relative ranks obscure countywide need, and who is deprioritized under each scenario lens.

## Update process

Material changes to inputs, weights, geography, or methods require a new score/model version and a migration note in `DECISIONS.md` and `CHANGELOG.md` — historical outputs are never silently updated in place.

## Limitations

_Pending — will be populated continuously as each phase surfaces concrete limitations, finalized in Phase 11._ Known from Phase 0 already: PLACES estimates are modeled small-area estimates, not direct tract surveys; ZIP-to-tract crosswalks introduce allocation uncertainty; HCAI ambulatory-surgery market share excludes physician-owned clinics by design; CalEnviroScreen 5.0 scores are not comparable to 4.0-era scores; NPPES-derived provider density (if used) reflects administrative enumeration, not appointment availability or active practice status.

## Contact / contribution path

_Pending — to be finalized in Phase 11 alongside `DELIVERY_REPORT.md` and the contributor guide._
