# The health equity screening score: what it is and is not

This document is the authoritative interpretation reference for the 0-100 number this pass
elevates as the product's canonical headline number (docs/design/final-score-map-and-
intuitiveness-review.md). It exists specifically to satisfy the pre-elevation requirement: **the
score's calculation, direction, universe, missing-data behavior, and rank/percentile treatment
are traced and documented here before the number is made visually dominant anywhere in the
product.** No calculation, weight, or scenario ID described below was changed to write this
document.

## 1. What the number is

The **health equity screening score** is a 0-100 composite built by:

1. Converting each of the 25 registered source metrics to a **county-relative percentile**
   (`pipelines/src/scc_health_pipeline/metrics/transforms.py:97-132`, average-rank ties), oriented
   so higher always means more concern (`flip_direction`, `transforms.py:23-37` — every currently
   registered metric is already `direction: concern_high` in `config/metrics.yml`, so this flip is
   presently a no-op, kept for any future protective metric).
2. Averaging present metric percentiles into 5 **subdomains**, then into 5 **domains** (Health
   needs, Access barriers, Environmental conditions, Community resources, Workforce shortage),
   each gated by a 70% coverage threshold — a domain with less than 70% of its expected inputs
   present becomes `None` for that tract, never zero
   (`pipelines/src/scc_health_pipeline/scoring/domain_scores.py:26,173-207`).
3. Combining the 5 domain scores into the **scenario score** via the active screening view's
   weights, renormalized over only the domains actually present for that tract
   (`pipelines/src/scc_health_pipeline/scoring/scenario_scores.py:38-94`).

## 2. Bounds

0-100. Not clamped by any explicit `min()`/`max()` — it falls out mathematically, because every
step above is a convex combination (percentile, then averages, then a renormalized weighted
average) of inputs already in `[0, 100]`, so the result cannot leave that range
(`docs/03_ANALYTICS_METHODS.md` §6.3).

## 3. Direction

**Higher score = more overlapping screening concern.** This applies at every level: metric,
domain, and the composite. A high score is not a measurement of a "bad" or "unhealthy" place, and
a low score does not certify a place as healthy or equitable — it means fewer of the screened
conditions showed elevated concern under the active screening view, nothing more.

## 4. Scenario dependence

**The composite score is scenario-specific; the 5 domain scores are not.** Switching the active
screening view (e.g., from "Health equity overview" to a different named scenario) changes the
weights applied in step 3 above and therefore changes the composite score, but does not change any
domain's own percentile-scale score (`analytics.domain_scores` carries no `scenario_id` column —
a domain's score does not depend on how domains are weighted against each other). A user-supplied
custom weight vector (Prioritize's "Custom scenario" option) is scored by an independently
implemented, parity-tested function (`apps/api/src/scc_health_api/services/
custom_scenario_scoring.py`) that applies the identical renormalize-and-weighted-sum formula.

## 5. Comparison universe

**All 408 Santa Clara County census tracts**, unconditionally — there is no eligibility filter
that removes a tract from the universe. A tract can still show "No score for this scenario" if too
much of its underlying data is missing (§6), but it is never silently dropped from the map, table,
or rankings. One scenario config field, `minimum_confidence`, is defined and displayed but **is not
currently applied as a filter anywhere in scoring or querying** — this is a known, disclosed gap
(§8), not a hidden behavior.

## 6. Missing-data behavior

Never zero-filled or median-imputed. A metric missing too much countywide coverage is excluded
entirely from every tract's domain calculation. A tract's own missing metric is simply excluded
from that tract's subdomain average. A domain below the 70% coverage threshold for a given tract
becomes `None` for that tract (not zero). If every weighted domain is missing for a tract under the
active scenario, the composite score itself is `None` — shown in the product as a dash and "No
score for this scenario," never as 0.

## 7. Rounding — now standardized

Before this pass, the score was independently rounded to different precisions in different
surfaces (nearest integer in Explore, 1 decimal in Prioritize, 2 decimals in the CSV export). This
pass introduces a single shared formatter (`apps/web/lib/screening-score.ts`) used by every surface
that displays the score to a person: **the displayed headline value is always the nearest integer,
0-100.** The full-precision float remains available in machine-readable exports (CSV) and in the
"How this was calculated" technical disclosure, explicitly labeled as the underlying precise value
rather than presented as a second, competing headline number.

## 8. Uncertainty — two distinct, intentionally separate statistics

- **Monte Carlo (measurement uncertainty).** 500 draws, seed 42
  (`pipelines/src/scc_health_pipeline/uncertainty/monte_carlo.py`), perturbing each metric's raw
  value by its own standard error and recomputing the full metric-to-score pipeline per draw.
  Produces `median_score`, a confidence interval, and `median_rank`. This is "if the underlying
  survey estimates had come out slightly differently due to their own sampling error, how much
  would the score/rank move" — surfaced in the product as **Data confidence**.
- **Weight sensitivity (assumption uncertainty).** 1,000 Dirichlet-resampled weight vectors
  (`pipelines/src/scc_health_pipeline/scoring/sensitivity.py`), re-aggregating the same (unperturbed)
  domain scores under many alternative weightings. This is "if a different set of priorities had
  been chosen, how much would the rank move" — combined with the data-confidence score into the
  **Stability** badge (Robust / Moderately stable / Assumption-sensitive / Data-limited).

**Confidence and stability are not the same concept and are never merged into one label**:
confidence is about how complete and precise the underlying data is; stability is about how much
the *ranking* depends on the specific weighting choice.

## 9. Rank and percentile — the canonical public method (this pass's decision)

The pipeline and API contain several internally legitimate but numerically different rank/percentile
computations (a deterministic score-sort rank used for CSV/table row numbers, a Monte-Carlo-derived
median-rank percentile, and a weight-sensitivity rank used only inside the Stability badge). Showing
more than one of these as a bare "percentile" or "rank" number in the same view was the exact
"82% vs 83%" trust problem an earlier pass's usability review caught and fixed by removing the
weaker of two competing numbers from the map. This pass makes that policy explicit and permanent:

> **The single public-facing comparison statistic is the Monte Carlo median-rank percentile** --
> "Higher [screening] concern than X% of 408 Santa Clara County tracts" -- computed as
> `round(((total_tracts - median_rank) / (total_tracts - 1)) * 100)`. It is uncertainty-aware (it
> reflects the *median* outcome across 500 resampled draws, not one brittle point-in-time sort), and
> it is the number Explore, Prioritize, Compare, and Advocate all now read from the same source
> (`explainScore`'s Monte Carlo detail) via the shared formatter, never a fresh client-side sort of
> raw scores.

A simple deterministic score-sort rank (e.g., Prioritize's "#N of 408") is retained *only* as an
ordinal position for browsing a ranked list -- it is not presented as a second, competing percentile
statistic, and Prioritize's rank number now always reflects the row's actual displayed sort position
rather than a stale server-sort index (§11).

## 10. Ties

Real ties in the underlying score are possible (weighted means of percentiles can coincide). Prior
to this pass, three different parts of the codebase broke ties three different ways (ascending
GEOID in the pipeline's Monte Carlo/sensitivity code; undefined SQL row order in one API route;
incidental DuckDB row order in another). This is disclosed here as a known limitation rather than
fixed: reconciling tie-break behavior across the pipeline and every API route is a backend
methodology change outside this pass's UX-and-presentation scope, and none of it is visible to a
user as a materially different *screening conclusion* -- a tie only affects which of two
equally-scored tracts happens to print first in a list.

## 11. Known limitations (disclosed, not fixed this pass)

- `minimum_confidence` (per-scenario) is defined and shown in scenario metadata but not enforced
  as a filter anywhere (§5).
- Tie-breaking is inconsistent across three backend code paths (§10).
- Advocate's place/district-level evidence score is a **different, simpler calculation** than the
  tract-level composite: an unweighted arithmetic mean of already-computed member-tract scores
  (`method="unweighted_average_across_member_tracts"`,
  `apps/api/src/scc_health_api/services/advocacy_evidence.py`), not a re-aggregation of domain
  percentiles. This is intentional and already self-labeled by the API, and this pass's shared
  formatter displays it with the same rounding/direction conventions as the tract-level score, but
  it is a materially different statistic and is captioned as an area-level average, never implied to
  be the same computation as a single tract's screening score.

## 12. Appropriate and inappropriate claims

**Appropriate:** "This tract's screening score suggests it warrants a closer look under the active
screening view, relative to other Santa Clara County tracts." "This score reflects overlapping
concern across the weighted domains, not any single condition." "The score would look different
under a different screening view, because it reflects that view's priorities, not a fixed medical
fact."

**Inappropriate, and never produced by this product:** any claim that a score measures a person's
health, proves a causal relationship, certifies funding eligibility, ranks communities by inherent
worth, or is precise beyond its own disclosed uncertainty. The always-visible headline caption "A
screening signal, not a prediction or a causal claim" (introduced in the prior consolidation pass,
DEC-077) applies to this number specifically and remains unconditionally visible everywhere the
score is the headline.
