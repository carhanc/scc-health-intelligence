# ED-Utilization Allocation and Criterion-Validity Methodology (Phase 7)

Status: Phase 7, implemented, unit-tested against hand-calculated examples, live-verified, audited. Closes RISK-015 (open since Phase 4).

## 1. What this module answers, and what it doesn't

HCAI publishes real emergency-department data at three native geographies: county of residence (2008-2024 time series), facility (2024), and patient ZIP code (2024). It does not publish ED data at the census-tract level, at any vintage. This module answers "what would a tract-level estimate of ED use look like, if we allocate real ZIP-level counts down by land area" — a modeled quantity, not an observed one. It does not, and cannot, tell you the true tract-level ED visit count.

## 2. The allocation

For each ZIP code's real observed encounter count (split into two never-combined groups, `ed_only` and `inpatient_from_ed`), the tract-level modeled count is:

```
modeled_encounters(tract) = sum over each ZIP z of: observed_encounters(z) * weight(z, tract)
```

`weight(z, tract)` is the existing, already-audited Census ZCTA-to-tract land-area relationship (`geo.crosswalk_zip_tract`, Phase 2, DEC-005) — not a new crosswalk built for this feature. A ZIP with no crosswalk entry at all contributes zero tracts; its encounters are disclosed as unmatched in the pipeline's diagnostics output, never silently dropped from any total or defaulted to a nearest tract.

Two disclosed approximations are inherent to this method, not hidden:

1. **Area weighting assumes ED use is spread proportionally to a ZIP's land area.** Real ED use is driven by where people live, not raw land area — this assumption breaks down for large tracts with low population density (see §4).
2. **HCAI's `patient_zip` is a USPS ZIP code; the crosswalk is keyed by Census ZCTA.** ZIP codes and ZCTAs are not always identical (`docs/02_DATA_SOURCE_REGISTRY.md` §3) — joined directly, the same approximation already used everywhere else this crosswalk is consumed.

## 3. Observed vs. modeled, never merged

| Table | Geography | Status |
|---|---|---|
| `analytics.utilization_ed_zip_observed` | patient ZIP | `observed` |
| `analytics.utilization_ed_facility_summary` | facility | `observed` |
| `analytics.utilization_ed_county_trends` | county | `observed` (or `suppressed`) |
| `analytics.utilization_ed_tract_modeled` | tract | `modeled` |
| `analytics.utilization_access_vs_utilization` | tract | `modeled` |

Every row in every table carries its own `data_status` and, for modeled rows, a `method` field — the API and UI never present a modeled figure without both.

## 4. A real artifact: the plausibility-ceiling reliability flag

Live verification surfaced a genuine consequence of area-weighting: a small number of large, sparsely-populated tracts hold a disproportionately high area-weight share of ZCTAs whose real population (and therefore ED volume) is concentrated elsewhere in the same ZCTA. One tract (06085513500, in the county's eastern hills) computed at 37,378 modeled ED visits per 1,000 residents — roughly 100x the true countywide rate (~320 per 1,000, computed directly from `total_observed_encounters / total_population`).

Any tract whose modeled rate exceeds 1,000 per 1,000 residents is flagged `rate_reliability="low_reliability"` with an explanatory note. This ceiling was calibrated against the live distribution (median 235, 95th percentile 855) — generous headroom above real-world ED utilization ceilings, so it only catches genuine allocation artifacts, not real neighborhood-level heterogeneity. 16 of 408 tracts (3.9%) are currently flagged; the API and UI surface this as a prominent badge, never a footnote, and never a silently omitted row.

## 5. Criterion-validity check (closes RISK-015)

Each of the 8 named scenarios' priority scores were tested (Spearman + Pearson rank correlation, 2,000-draw bootstrap 95% CI) against `modeled_ed_rate_per_1000` — the same tautology-guard-screened, same-methodology check already established for Phase 4's convergent-validity check against CDC/ATSDR SVI (`validation/correlation_diagnostics.py`, reused unchanged). Results are moderate positive correlations (Spearman r 0.27-0.37 across all 8 scenarios, n=408, all `is_tautological=false`) — weaker than the SVI convergent-validity check, consistent with what a defensible screening tool checked against a noisier, allocation-derived (not directly observed) outcome should show.

**This is criterion validity against a modeled outcome, and is not causal evidence.** It shows the scenario scores are associated with modeled emergency-department use in the expected direction; it does not establish that any scenario "predicts" utilization, or that any intervention targeted by a high score would reduce it.

## 6. Known limitations

- Area weighting, not population weighting — see §4's disclosed reliability flag for the practical consequence.
- ZIP vs. ZCTA approximation (§2.2) applies to every allocated figure.
- 2.3% of observed ZIP-level encounters could not be allocated to any tract (no crosswalk entry) — a small, disclosed leakage, not silently absorbed into totals.
- The criterion-validity outcome is itself a modeled quantity, not a ground-truth utilization measure — a stronger check would require a genuinely observed tract-level outcome, which does not exist in any public HCAI product.
