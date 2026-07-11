# 03 — Analytics, Scoring, Validation, and Optimization Methods

## 1. Analytical philosophy

The platform must make complex analysis useful without manufacturing false precision.

The analytical system should separate:

1. **description** — what public data estimate or count shows;
2. **comparison** — how a place compares with a defined reference group;
3. **screening** — where several concerns overlap;
4. **validation** — whether a screen aligns with an independent outcome;
5. **scenario analysis** — how rankings change under explicit priorities;
6. **optimization** — which candidate configuration best satisfies a stated mathematical objective;
7. **causal inference** — generally outside the scope unless a valid design is implemented and reviewed.

A location-allocation output is not a health-impact forecast. A percentile is not a probability. A correlation is not causation. A modeled prevalence estimate is not an observed tract count.

## 2. Unit of analysis and geographic harmonization

### 2.1 Canonical tract

Use 2020 Census tracts in Santa Clara County as the canonical neighborhood unit. Canonical IDs are 11-character strings.

### 2.2 Native geography retention

Every source remains available at native geography. Crosswalked values must never replace the native table.

### 2.3 ZIP/ZCTA-to-tract allocation

For ZIP-based HCAI data:

1. Prefer current HUD USPS ZIP-to-tract residential-address weights.
2. If unavailable, use Census ZCTA-to-tract relationships and a population- or residential-address-based allocation.
3. For counts, allocate:

```text
allocated_count(tract) = sum_over_zip(native_count(zip) * weight(zip, tract))
```

4. For rates, allocate numerators and denominators separately whenever possible, then recompute the rate.
5. Preserve an allocation-quality field:

```text
native
high_confidence_crosswalk
moderate_confidence_crosswalk
low_confidence_area_weighted
```

6. Display crosswalked results as “allocated estimates.”

### 2.4 Aggregate geographies

Aggregate tract metrics to city or supervisor district using appropriate population or denominator weights. Never average percentages without weighting.

For prevalence:

```text
aggregate_prevalence = sum(tract_prevalence * tract_relevant_population) / sum(tract_relevant_population)
```

If the correct denominator is unavailable, label the aggregation approximate.

### 2.5 Population-weighted origins

Resource and travel analysis should use population-weighted origins rather than only geometric tract centroids when feasible.

Preferred order:

1. census-block or block-group population-weighted centroids;
2. block-group centroids weighted by relevant population;
3. tract internal points weighted by population distribution;
4. geometric centroid only as a clearly labeled screening fallback.

## 3. Metric registry

Create a machine-readable `config/metrics.yml` with one record per metric.

Required fields:

```yaml
metric_id:
label:
domain:
source_id:
source_field:
unit:
direction: concern_high | concern_low | neutral
population_denominator:
transform:
winsorization:
uncertainty_type:
minimum_coverage:
allowed_geographies:
plain_language_definition:
interpretation:
limitations:
```

This registry, not ad hoc column matching, drives scoring and UI labels.

## 4. Domain model

Do not lead with one universal index. Build interpretable domains.

### 4.1 Health burden

Candidate components:

- diabetes prevalence;
- hypertension/high blood pressure;
- obesity;
- coronary heart disease;
- stroke;
- depression;
- frequent mental distress;
- frequent physical distress;
- physical inactivity;
- poor self-rated health.

Avoid overweighting closely correlated metrics. Use a documented redundancy review and either:

- select representative measures;
- reduce within subdomains;
- or equal-weight subdomains rather than individual metrics.

Suggested subdomains:

- cardiometabolic;
- mental health;
- functional/physical health;
- behavior/risk.

### 4.2 Access barriers

Candidate components:

- uninsured;
- poverty;
- limited English proficiency;
- no-vehicle households;
- disability;
- older adults living in high-barrier settings;
- broadband/telehealth access;
- housing cost burden;
- overcrowding;
- public coverage/Medi-Cal proxy.

Group into:

- affordability/coverage;
- language/navigation;
- mobility;
- functional access;
- digital/housing stability.

### 4.3 Resource accessibility

Candidate components:

- travel time to clinical care;
- travel time to HRSA health center/FQHC;
- travel time to hospital/ED;
- travel time to pharmacy;
- travel time to behavioral-health service;
- travel time to food resource/SNAP retailer;
- transit service frequency;
- provider accessibility score;
- resources within 15/30/45 minutes;
- Enhanced Two-Step Floating Catchment Area score.

Direction must be consistent: higher `resource_access_gap` means greater concern, while higher `resource_accessibility` means better access. Do not use confusing reverse scales in the same view.

### 4.4 ED utilization pressure

Candidate components:

- ED visits per 1,000;
- admissions through ED;
- ambulatory-care-sensitive diagnosis group rate;
- uninsured/self-pay share;
- Medi-Cal share;
- preferred-language mismatch/context;
- out-of-county or out-of-system patient flow;
- facility concentration or travel burden.

This domain must expose native geographic resolution and crosswalk quality.

### 4.5 Environmental burden

Use CalEnviroScreen component measures or subdomains. Avoid double counting population characteristics already present in Access Barriers. Separate pollution burden from population vulnerability when possible.

### 4.6 Workforce shortage

Candidate components:

- HPSA designation and score;
- MUA/P designation;
- provider density by relevant specialty;
- HCAI workforce supply indicators;
- FQHC/health-center availability;
- estimated provider-to-population accessibility.

NPPES provider density must be labeled administrative and not equivalent to appointment availability.

### 4.7 Data confidence

Build a separate confidence/reliability domain. It must not be treated as need.

Inputs:

- source freshness;
- estimate uncertainty;
- percentage of configured metrics present;
- native versus crosswalked geography;
- source tier;
- suppression;
- sample/model limitations;
- rank stability.

## 5. Metric preprocessing

### 5.1 Directionality

Transform every metric so higher analytical percentile means more concern for need/gap domains.

For protective measures such as routine checkups or provider accessibility:

```text
concern_value = -protective_value
```

Retain original value for display.

### 5.2 Outliers

Use winsorization only when justified and configured, typically at county 1st/99th or 2.5th/97.5th percentiles. Show raw values and record transformed values.

Never winsorize counts or rates merely to make a map look smoother.

### 5.3 County-relative percentile

For a metric after direction alignment:

```text
percentile_i = empirical_percentile(value_i among valid Santa Clara tracts) * 100
```

Use average ranks for ties. Display comparison group explicitly.

### 5.4 State-relative comparison

If statewide data are available, optionally calculate a California percentile. Never mix county and state percentiles without labeling.

### 5.5 Standard scores

Z-scores may be retained for analysis but should not be the primary public display. If used:

```text
z_i = (x_i - mean(x)) / standard_deviation(x)
```

Use robust z-scores based on median/MAD for heavily skewed metrics when configured.

## 6. Domain score construction

### 6.1 Equal subdomain weighting

Default method:

1. Convert component metrics to concern percentiles.
2. Average metrics within a subdomain.
3. Average subdomains within the domain.

This prevents a domain with many redundant metrics from dominating.

```text
subdomain_score = weighted_mean(metric_percentiles)
domain_score = weighted_mean(subdomain_scores)
```

### 6.2 Coverage threshold

A domain score is valid only if:

- at least the configured fraction of subdomains is present; and
- each included subdomain meets its minimum metric coverage.

Default domain coverage threshold: 70%, configurable.

Do not impute missing metrics with zero or the county median in production scoring unless a method explicitly requires it and the UI reports it.

### 6.3 Score scale

Return domain scores on 0–100, with higher meaning greater concern for burden/gap domains.

The score is a county-relative screening score, not a percentage of need.

## 7. Scenario-specific priority scores

A scenario is a versioned configuration, for example:

```yaml
scenario_id: mobile_care_v1
label: Mobile or transit-linked care
weights:
  health_burden: 0.30
  access_barriers: 0.30
  resource_access_gap: 0.30
  ed_utilization_pressure: 0.10
required_metrics:
  - no_vehicle_households
  - clinical_travel_time
constraints:
  minimum_confidence: 0.60
```

### 7.1 Default integrated screen

A default integrated screen may be offered, but the UI must show weights and allow users to choose issue-specific scenarios.

### 7.2 Suggested scenario logic

#### Diabetes prevention

Domains:

- cardiometabolic burden;
- physical inactivity/food access;
- coverage/access barriers;
- preventive-care/resource access;
- ACS/PLACES confidence.

#### Mobile or transit-linked care

Domains:

- health burden;
- no-vehicle/mobility barriers;
- network travel time to care;
- transit frequency;
- resource gap;
- ED pressure.

#### Coverage navigation

Domains:

- uninsured/public-coverage context;
- poverty;
- language access;
- ED payer mix;
- proximity to enrollment/navigation resources if available.

#### Language access

Domains:

- limited English proficiency;
- language-group distribution;
- preferred-language utilization context;
- provider/facility language availability when reliable;
- health/access burden.

#### Pharmacy access

Domains:

- pharmacy network travel time;
- chronic medication burden proxies;
- older adults/disability;
- no vehicle;
- poverty/coverage.

#### Older-adult support

Domains:

- age 65+;
- disability;
- chronic burden;
- transit/no vehicle;
- pharmacy/clinical/community-resource access.

#### Behavioral-health access

Domains:

- depression/frequent mental distress;
- mental-health HPSA/workforce;
- behavioral-health facility access;
- ED utilization context;
- poverty/coverage/language barriers.

#### Food access

Domains:

- food insecurity or SNAP context;
- diabetes/obesity;
- SNAP retailer and grocery access;
- no vehicle/transit;
- poverty.

## 8. Uncertainty propagation

### 8.1 ACS estimates

For a 90% ACS margin of error:

```text
standard_error = MOE / 1.645
```

For derived proportions, use Census-recommended formulas where possible. If using an approximation, record it.

### 8.2 PLACES estimates

When 95% confidence limits are available:

```text
standard_error ≈ (upper - lower) / (2 * 1.96)
```

If the interval construction differs, use source documentation.

### 8.3 Monte Carlo score uncertainty

For each tract and metric:

1. Draw from a bounded distribution based on estimate and standard error.
2. Respect logical limits, such as 0–100 for percentages.
3. Recompute metric percentiles, domain scores, and scenario scores.
4. Repeat with a deterministic seed, default 500–1,000 draws.

Report:

- median score;
- 10th–90th or 2.5th–97.5th interval;
- median rank;
- rank interval;
- probability of top-decile/top-quartile status.

The UI should favor language such as:

- stable high priority;
- likely high priority but uncertain rank;
- sensitive/uncertain;
- insufficient precision.

### 8.4 Data-confidence score

A possible transparent formulation:

```text
confidence =
  0.35 * coverage_component +
  0.30 * precision_component +
  0.20 * geography_quality_component +
  0.15 * freshness_source_component
```

Each component must be documented and visible. Confidence should not automatically suppress a high-need tract; it should indicate the need for caution or additional data.

## 9. Weight sensitivity and robustness

### 9.1 Preset sensitivity

Calculate each scenario under:

- balanced weights;
- need-first;
- access-first;
- resource-first;
- utilization-first.

### 9.2 Random-weight sensitivity

Sample plausible domain weights from a Dirichlet distribution constrained to the selected domains. Use at least 1,000 draws for final builds.

Report:

- probability of top 10% and top 25%;
- median rank;
- 10th–90th rank interval;
- rank standard deviation;
- most influential domain weight.

### 9.3 Stability labels

Suggested labels:

- **Robust:** top-tier across most tested weights and uncertainty draws.
- **Moderately stable:** remains elevated but rank varies.
- **Assumption-sensitive:** priority depends strongly on chosen weights.
- **Data-limited:** uncertainty or coverage prevents a stable conclusion.

Do not call these probabilities of real-world intervention success.

## 10. Explainability

Every score must expose:

- component domains;
- component metrics;
- raw value and unit;
- county/state percentile;
- contribution to the score;
- uncertainty;
- weight;
- source/vintage;
- directionality;
- missing metrics;
- scenario configuration hash.

### 10.1 Contribution calculation

For a weighted arithmetic score:

```text
contribution(metric) = normalized_weight(metric) * metric_concern_percentile
```

Group by domain for the default view.

### 10.2 Score-decomposition counterfactual

The platform may show a noncausal decomposition such as:

> If this tract’s resource-access domain were set to the county median, its scenario score would move from X to Y.

Label this “score decomposition,” not “expected intervention impact.”

## 11. Spatial analysis

### 11.1 Spatial clustering

Offer optional:

- global Moran’s I;
- Local Moran’s I;
- Getis-Ord Gi* hot-spot analysis.

Requirements:

- define the spatial-weights matrix;
- handle islands;
- use permutation testing;
- correct or disclose multiple-comparison issues;
- show cluster categories and p-values;
- avoid presenting statistical clusters as causal neighborhoods.

### 11.2 Spatial smoothing

Use empirical-Bayes smoothing only for observed count/rate outcomes with unstable denominators. Do not smooth PLACES modeled estimates by default.

### 11.3 Spatial cross-validation

Any predictive model must use spatially aware folds or geographic holdouts to reduce leakage from neighboring tracts.

## 12. Resource-access analytics

### 12.1 Facility deduplication

Deduplicate official and supplemental points through:

- normalized name similarity;
- address similarity;
- spatial distance threshold;
- source priority;
- facility identifiers.

Retain a source-membership table rather than discarding duplicates.

### 12.2 Baseline proximity

Always provide a reproducible baseline:

- population-weighted origin to nearest resource;
- counts within fixed network/straight-line thresholds;
- source coverage.

If only straight-line distance is available, label it explicitly.

### 12.3 Network travel time

Preferred implementation:

- walking/driving network from OpenStreetMap using OSMnx/networkx or a reproducible routing engine;
- transit travel time using VTA GTFS plus R5/OpenTripPlanner when feasible;
- representative departure windows rather than a single arbitrary minute;
- travel-time distributions or median across departure times.

Required labels:

- mode;
- departure date/time window;
- network/feed vintage;
- routing engine;
- whether wait time and transfers are included;
- missing/unreachable result handling.

Do not silently replace network travel time with centroid distance.

### 12.4 Catchments

Calculate population and high-need population within 15-, 30-, and 45-minute catchments. Avoid double counting when summing across overlapping facilities.

### 12.5 Enhanced Two-Step Floating Catchment Area

Implement E2SFCA when capacity proxies exist.

Step 1, facility supply-to-demand ratio:

```text
R_j = S_j / sum_k(P_k * W(d_kj))
```

Step 2, population accessibility:

```text
A_i = sum_j(R_j * W(d_ij))
```

Where:

- `S_j` is capacity proxy;
- `P_k` is relevant population;
- `W(d)` is a documented distance-decay function;
- facilities and population are included within a maximum catchment.

If capacity is unknown, use a clearly labeled facility-count proxy and do not call it provider capacity.

## 13. Location-allocation optimization

### 13.1 Purpose

Support mobile-clinic or outreach-site scenario planning.

### 13.2 Candidate sites

Candidate sites may include:

- community centers;
- libraries;
- public clinics;
- transit hubs;
- schools or other public sites only if policy-appropriate and publicly listed;
- user-supplied candidate points.

### 13.3 Objective

Use OR-Tools to implement a maximal covering location problem and optionally p-median/minimax variants.

Example objective:

```text
maximize sum_i(need_weight_i * population_i * covered_i)
```

Subject to:

```text
number_of_sites <= k
covered_i = 1 if any selected site is within threshold
optional district/equity/capacity constraints
```

### 13.4 Outputs

- selected candidate sites;
- population covered;
- high-need population covered;
- marginal gain per site;
- overlap;
- unserved high-need areas;
- near-optimal alternatives;
- sensitivity to travel-time threshold and weights;
- objective value;
- solver gap/status;
- assumptions.

Never translate coverage into avoided ED visits, dollars saved, or improved health outcomes without an independent causal model.

## 14. HCAI utilization analysis

### 14.1 Core measures

- encounters and visits;
- rate per 1,000 residents when denominator is valid;
- payer mix;
- disposition/admission;
- preferred language;
- diagnosis group;
- patient origin;
- destination facility;
- out-of-county share;
- destination concentration/HHI;
- facility market share;
- year-over-year change.

### 14.2 Ambulatory-care-sensitive conditions

If diagnosis data support it, implement a transparent ICD-10 grouping based on a documented public specification such as AHRQ Prevention Quality Indicators. Version and test the code list.

### 14.3 Market concentration

Herfindahl-Hirschman Index:

```text
HHI = sum_j(share_j^2)
```

State whether shares are expressed 0–1 or 0–100 and scale accordingly.

### 14.4 Flow leakage

Define leakage precisely, for example:

```text
leakage = share of resident-origin ED encounters occurring outside selected geography or system
```

The user must choose the reference system/geography; do not assume all out-of-county care is undesirable.

## 15. Independent validation

### 15.1 Prohibited tautological validation

Do not report:

- diabetes-priority score correlated with diabetes prevalence when diabetes prevalence is an input;
- coverage-navigation score correlated with uninsured percentage when uninsured percentage is an input;
- any score correlated with its own components as evidence of validity.

Those are construction checks, not validation.

### 15.2 Valid external criteria

Potential independent criteria:

- HCAI ED utilization or ambulatory-care-sensitive ED burden;
- hospital admissions through ED;
- patient-flow burden;
- independent mortality or hospitalization data at an appropriate geography;
- future-year outcomes when comparing a baseline score with later data;
- external established indices only as convergent validity, with overlap disclosed;
- county/internal data if later provided.

### 15.3 Validation design

For each validation:

- state the hypothesis before analysis;
- use independent outcome and time period;
- document geography and crosswalk;
- report sample size;
- report missing/suppressed observations;
- use Spearman and Pearson only when appropriate;
- include confidence intervals via bootstrap;
- assess spatial autocorrelation of residuals;
- use spatial holdout for predictive models;
- report negative or inconclusive results;
- distinguish criterion validity, convergent validity, and face validity.

### 15.4 Predictive models

Prediction is optional and must not be added merely for novelty.

If implemented:

- define a meaningful independent target;
- split by time or geography;
- compare against simple baselines;
- use interpretable models first;
- report calibration and discrimination;
- avoid overfitting 408 tracts;
- use nested/spatial cross-validation;
- publish feature importance with caveats;
- never expose individual risk.

## 16. Trend analysis

### 16.1 ACS

Prefer non-overlapping periods, such as 2015–2019 versus 2020–2024, and use statistical significance testing.

### 16.2 PLACES

Only compare releases when CDC documents measure and method comparability. Mark breaks.

### 16.3 HCAI

Normalize labels and facility identifiers across years. Account for facility openings/closures and coding changes.

### 16.4 Trend display

Show:

- point estimates;
- uncertainty;
- annual/five-year period;
- absolute and relative change;
- significance or comparability note.

Avoid traffic-light labels based on trivial changes.

## 17. Fairness and ethical review

### 17.1 Protected characteristics

Race, ethnicity, and language may be essential for equity analysis but should not be used to stigmatize or infer individual traits.

Use them to identify structural inequities, describe populations, and evaluate whether benefits reach affected communities.

### 17.2 Ranking harms

The platform must avoid labeling neighborhoods as failures. Use issue-specific, changeable language such as “higher estimated barrier” and emphasize structural conditions and resource gaps.

### 17.3 Allocation fairness

Optimization scenarios should support constraints such as:

- minimum service to high-need districts;
- maximum travel-time inequality;
- minimum coverage of limited-English or low-income populations;
- no exclusion solely due to data uncertainty.

Report tradeoffs rather than hiding them.

## 18. Reproducibility

Every analysis output must include:

- code version/Git commit;
- data manifest hash;
- metric registry version;
- scenario configuration;
- random seed;
- build timestamp;
- method version;
- geography vintage.

Exports should carry a compact reproducibility ID.

## 19. Model card

Create `MODEL_CARD.md` with:

- intended users;
- intended uses;
- prohibited uses;
- data sources;
- geography;
- scoring method;
- uncertainty;
- sensitivity;
- validation results;
- fairness considerations;
- update process;
- limitations;
- contact/contribution path.

## 20. Required analytics audits

`make audit` must fail when:

- canonical GEOID overlap falls below threshold;
- required fields are all null;
- scores fall outside 0–100;
- score coverage is below threshold without suppression;
- a scenario references missing metrics;
- crosswalk weights are invalid;
- native and allocated geographies are confused;
- uncertainty fields disappear from a source that provides them;
- validation reuses score inputs as independent outcomes;
- resource distance fields are all null;
- a resource category has zero points without visible status;
- HCAI status is inconsistent across files;
- a numeric output lacks provenance;
- an export contains uncited numbers.
