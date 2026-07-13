# Mobile-Service Site-Placement Optimization Methodology (Phase 6)

Status: Phase 6, extended and re-verified. Implements docs/03 §13. This is a **scenario-planning tool** — outputs are explicitly labeled a modeled configuration, never a forecast of avoided ED visits, dollars saved, or health outcomes (docs §13.4, CLAUDE.md), and optimizer language never says "people served" or "patients served."

## 1. The model

`pipelines/src/scc_health_pipeline/optimization/location_allocation.py` implements a maximal-covering-location model (OR-Tools CP-SAT): choose up to `k_sites` candidate locations to maximize need-weighted population within `distance_threshold_miles` of a selected site, optionally subject to an equity constraint (a minimum fraction of high-need demand points must be covered).

## 2. What changed in Phase 6

Three of the four limitations documented when this optimizer first shipped (Phase 4) are now addressed:

- **Population-weighted demand**: `DemandPoint` now carries a `block_group_geoid` field — real population-weighted origins (`geo.block_group_population_origins`) flow directly into the existing `population`/`need_weight` fields, not a tract-internal-point count.
- **Layered, disclosed distance**: coverage distance is now pluggable. An optional `precomputed_distances` lookup (exact real network distances, e.g. from `run_access_metrics_pipeline.py`'s output) takes priority; an optional `distance_fn` callable is the next fallback; haversine straight-line screening (DEC-024) remains the default, which keeps the function usable for arbitrary or hypothetical candidate sites with no precomputed route. The result's `method` field always reflects which was actually used — a straight-line-covered scenario is never presented as network-routed.
- **Explicitly labeled candidate-site types**: `CandidateSite.site_type` is `"transit_hub"` (real VTA stops, the default) or `"abstract_analytical"` (a hypothetical analytical point, e.g. a population-weighted demand center used to explore "what if a site existed here") — never presented as a real, buildable, or currently-available location.

The fourth (VTA-transit-stops-only candidates) remains: libraries, community centers, and senior centers have no verified official bulk source this session (RISK-022) — not fabricated as candidate sites.

## 3. The precomputed sensitivity sweep

Per this phase's "Sensitivity and Robustness" requirement, `run_analytics_pipeline.py` runs 6 real scenarios varying k_sites, distance_threshold, and whether an equity constraint applies, rather than one fixed configuration:

| Scenario | k_sites | Threshold | Equity | Live result |
|---|---|---|---|---|
| baseline | 5 | 2.0 mi | 50% | OPTIMAL, 510,649 covered |
| more_sites | 10 | 2.0 mi | 50% | OPTIMAL, 666,055 covered |
| tight_threshold | 10 | 1.0 mi | 50% | **INFEASIBLE** |
| no_equity_constraint | 5 | 2.0 mi | none | OPTIMAL, 510,649 covered |
| walk_plausible_threshold | 5 | 0.5 mi | none | OPTIMAL, 57,418 covered |
| larger_network | 15 | 2.0 mi | 50% | OPTIMAL, 666,055 covered (same as k=10 — a real "marginal value of additional sites" finding: 10 sites already saturate reachable coverage at this threshold) |

The `tight_threshold` infeasibility is a real, informative result (no combination of 10 sites within 1 mile can satisfy the 50% high-need equity requirement), not an error — surfaced to the user as "No solution satisfies these constraints," per the UI content standard.

## 4. Why the API does not run a live solve (DEC-051, DEC-022)

`apps/api`'s Access Lab routes deliberately do not import `scc_health_pipeline.optimization.location_allocation` or run OR-Tools live — an established architectural boundary (DEC-022) keeping the API's runtime dependency-light. `GET /api/v1/access/optimize/scenarios` reads the precomputed 6-scenario sweep above; exploring a new parameter combination means adding it to the pipeline step and re-running `make data`, not calling the API with arbitrary parameters.

## 5. Known limitations

- Coverage distance for the transit-hub candidate sites uses straight-line screening by default (no precomputed network distance exists for every candidate/demand pair) — disclosed in every scenario's `assumptions` field.
- `abstract_analytical` candidate sites are hypothetical analytical points, not evaluated for real-world buildability, cost, zoning, or community input.
- Marginal-gain-per-site is a direct "unique contribution from the realized coverage matrix" measure, not re-solved per site — an honest, not re-optimized, decomposition.
