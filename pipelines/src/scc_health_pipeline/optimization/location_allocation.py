"""Location-allocation optimization: OR-Tools maximal-covering-location
model for mobile-clinic/outreach-site scenario planning, per
docs/03_ANALYTICS_METHODS.md §13.

Candidate sites use VTA GTFS high-frequency transit stops (docs §13.2
explicitly lists "transit hubs" as a valid candidate category, and this
is real, available data -- community centers/libraries are documented as
an unavailable source category this phase, RISK-022, not fabricated).
Sites may also be marked `site_type="abstract_analytical"` -- e.g. a
population-weighted block-group origin used as a candidate point when
exploring "what if a site existed near this demand concentration"
scenarios -- per this project's explicit rule that abstract candidate
points must be clearly labeled as such, never presented as a real
deployment site (CLAUDE.md, docs/03 §13.2).

Demand points carry real population-weighted block-group origins (Phase
6's `geo.block_group_population_origins`), not tract-internal-point
counts -- resolving one of this module's originally-documented Phase 6
scope gaps.

Coverage distance defaults to straight-line (DEC-024) and stays fully
functional with no external dependency for arbitrary candidate sites
(including hypothetical ones with no precomputed route). Callers with a
precomputed network-distance lookup for their specific candidate/demand
pairs (e.g. from `routing/network_osm.py`) may inject it via
`distance_fn`/`distance_method_label` to get network-aware coverage
instead -- the result's `method` field always reflects which was
actually used, so a straight-line-covered scenario is never presented as
network-routed.

This is a scenario-planning tool: outputs are explicitly labeled a
modeled configuration, never a forecast of avoided ED visits, dollars
saved, or health outcomes (docs §13.4, CLAUDE.md).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from ortools.sat.python import cp_model

from scc_health_pipeline.routing.straight_line import METHOD_LABEL, haversine_miles

SiteType = Literal["transit_hub", "abstract_analytical"]

DistanceFn = Callable[[float, float, float, float], float]


@dataclass(frozen=True)
class CandidateSite:
    site_id: str
    label: str
    lat: float
    lon: float
    site_type: SiteType = "transit_hub"


@dataclass(frozen=True)
class DemandPoint:
    tract_geoid_2020: str
    lat: float
    lon: float
    population: float
    need_weight: float  # 0-1, e.g. health_burden domain score / 100
    block_group_geoid: str | None = None


@dataclass(frozen=True)
class OptimizationResult:
    status: str
    objective_value: float | None
    k_sites: int
    distance_threshold_miles: float
    selected_sites: list[str] = field(default_factory=list)
    population_covered: float = 0.0
    high_need_population_covered: float = 0.0
    total_population: float = 0.0
    total_high_need_population: float = 0.0
    covered_tract_geoids: list[str] = field(default_factory=list)
    unserved_high_need_tracts: list[str] = field(default_factory=list)
    marginal_gain_per_site: dict[str, float] = field(default_factory=dict)
    overlap_count: int = 0  # demand points covered by more than one selected site
    assumptions: list[str] = field(default_factory=list)
    n_abstract_analytical_sites_selected: int = 0
    method: str = METHOD_LABEL


def _build_assumptions(
    distance_method: str, candidate_sites: list[CandidateSite]
) -> list[str]:
    site_type_counts: dict[str, int] = {}
    for s in candidate_sites:
        site_type_counts[s.site_type] = site_type_counts.get(s.site_type, 0) + 1
    site_type_summary = ", ".join(f"{n} {t}" for t, n in sorted(site_type_counts.items()))

    assumptions = [
        "Coverage is a modeled scenario configuration, not a forecast of avoided ED visits, "
        "dollars saved, or health outcomes.",
        f"Distance method: {distance_method}.",
        f"Candidate sites ({len(candidate_sites)} total): {site_type_summary}. "
        "'transit_hub' sites are real VTA GTFS stops; 'abstract_analytical' sites are "
        "hypothetical analytical points (e.g. a population-weighted demand center), not "
        "real, buildable, or currently-available locations -- see RISK-022 for the "
        "documented gap in real community-center/library/senior-center candidate data.",
        "Demand uses real population-weighted block-group origins where available "
        "(geo.block_group_population_origins), falling back to tract-level population for "
        "any demand point without one.",
    ]
    return assumptions


def run_maximal_covering_location(
    candidate_sites: list[CandidateSite],
    demand_points: list[DemandPoint],
    k_sites: int,
    distance_threshold_miles: float,
    high_need_percentile_threshold: float = 75.0,
    equity_min_coverage_fraction: float | None = None,
    time_limit_seconds: float = 15.0,
    distance_fn: DistanceFn | None = None,
    distance_method_label: str = "straight_line_screening",
    precomputed_distances: dict[tuple[str, str], float] | None = None,
) -> OptimizationResult:
    """Three layered ways to get coverage distance, in priority order:

    1. `precomputed_distances[(origin_id, site_id)]` (origin_id is
       `demand.block_group_geoid` if set, else `demand.tract_geoid_2020`)
       -- an exact real network distance already computed elsewhere (e.g.
       `routing/network_osm.py`'s batch output). A demand/site pair with
       no entry is treated as "distance unknown for this pair," NOT
       covering -- it never silently falls back to a different method for
       that one pair, which would produce a coverage matrix mixing
       methods without disclosure.
    2. `distance_fn(origin_lat, origin_lon, dest_lat, dest_lon) -> miles`
       -- any other distance lookup/computation (e.g. a live routing
       call), used for pairs not in `precomputed_distances`.
    3. Haversine straight-line screening (DEC-024), the default when
       neither of the above is supplied -- works for any candidate site,
       including hypothetical ones with no precomputed route.
    """
    if precomputed_distances is not None:
        distance_method = "network_distance_precomputed"
    elif distance_fn is not None:
        distance_method = distance_method_label
    else:
        distance_method = METHOD_LABEL

    if not candidate_sites or not demand_points or k_sites <= 0:
        return OptimizationResult(
            status="INVALID_INPUT",
            objective_value=None,
            k_sites=k_sites,
            distance_threshold_miles=distance_threshold_miles,
            assumptions=_build_assumptions(distance_method, candidate_sites),
        )

    fallback_dist = distance_fn if distance_fn is not None else haversine_miles

    def _distance(origin_id: str, d: DemandPoint, s: CandidateSite) -> float | None:
        if precomputed_distances is not None:
            key = (origin_id, s.site_id)
            if key in precomputed_distances:
                return precomputed_distances[key]
            if distance_fn is None:
                return None  # no precomputed entry, no fallback callable -- unknown, not covering
        return fallback_dist(d.lat, d.lon, s.lat, s.lon)

    # Coverage matrix: covering_sites[i] = list of candidate indices within threshold of demand i.
    covering_sites: list[list[int]] = []
    for d in demand_points:
        origin_id = d.block_group_geoid or d.tract_geoid_2020
        covers = [
            j
            for j, s in enumerate(candidate_sites)
            if (dist := _distance(origin_id, d, s)) is not None and dist <= distance_threshold_miles
        ]
        covering_sites.append(covers)

    need_values = sorted(d.need_weight for d in demand_points)
    threshold_index = min(
        len(need_values) - 1, int((high_need_percentile_threshold / 100.0) * len(need_values))
    )
    high_need_cutoff = need_values[threshold_index]
    high_need_indices = [
        i for i, d in enumerate(demand_points) if d.need_weight >= high_need_cutoff
    ]

    model = cp_model.CpModel()
    x = [model.NewBoolVar(f"x_{j}") for j in range(len(candidate_sites))]
    y = [model.NewBoolVar(f"y_{i}") for i in range(len(demand_points))]

    for i, covers in enumerate(covering_sites):
        if covers:
            model.Add(y[i] <= sum(x[j] for j in covers))
        else:
            model.Add(y[i] == 0)

    model.Add(sum(x) <= k_sites)

    if equity_min_coverage_fraction is not None and high_need_indices:
        min_covered = int(equity_min_coverage_fraction * len(high_need_indices))
        model.Add(sum(y[i] for i in high_need_indices) >= min_covered)

    # Integer-scaled objective (CP-SAT requires integer coefficients).
    scale = 1000
    objective_terms = [
        int(round(demand_points[i].need_weight * demand_points[i].population * scale)) * y[i]
        for i in range(len(demand_points))
    ]
    model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return OptimizationResult(
            status=status_name,
            objective_value=None,
            k_sites=k_sites,
            distance_threshold_miles=distance_threshold_miles,
            total_population=sum(d.population for d in demand_points),
            total_high_need_population=sum(demand_points[i].population for i in high_need_indices),
            assumptions=_build_assumptions(distance_method, candidate_sites),
        )

    selected_site_indices = [j for j in range(len(candidate_sites)) if solver.Value(x[j]) == 1]
    covered_demand_indices = [i for i in range(len(demand_points)) if solver.Value(y[i]) == 1]

    population_covered = sum(demand_points[i].population for i in covered_demand_indices)
    high_need_covered_indices = [i for i in covered_demand_indices if i in set(high_need_indices)]
    high_need_population_covered = sum(
        demand_points[i].population for i in high_need_covered_indices
    )
    unserved_high_need = [
        demand_points[i].tract_geoid_2020
        for i in high_need_indices
        if i not in set(covered_demand_indices)
    ]

    # Marginal gain per selected site = population uniquely covered by that
    # site among the selected set (not re-solved -- a direct, honest
    # "unique contribution" measure from the realized coverage matrix).
    marginal_gain: dict[str, float] = {}
    overlap_count = 0
    for i in covered_demand_indices:
        covering_selected = [j for j in covering_sites[i] if j in set(selected_site_indices)]
        if len(covering_selected) > 1:
            overlap_count += 1
        elif len(covering_selected) == 1:
            site_id = candidate_sites[covering_selected[0]].site_id
            marginal_gain[site_id] = marginal_gain.get(site_id, 0.0) + demand_points[i].population

    n_abstract_selected = sum(
        1 for j in selected_site_indices if candidate_sites[j].site_type == "abstract_analytical"
    )

    return OptimizationResult(
        status=status_name,
        objective_value=solver.ObjectiveValue() / scale,
        k_sites=k_sites,
        distance_threshold_miles=distance_threshold_miles,
        selected_sites=[candidate_sites[j].site_id for j in selected_site_indices],
        population_covered=population_covered,
        high_need_population_covered=high_need_population_covered,
        total_population=sum(d.population for d in demand_points),
        total_high_need_population=sum(demand_points[i].population for i in high_need_indices),
        covered_tract_geoids=[demand_points[i].tract_geoid_2020 for i in covered_demand_indices],
        unserved_high_need_tracts=unserved_high_need,
        marginal_gain_per_site=marginal_gain,
        overlap_count=overlap_count,
        assumptions=_build_assumptions(distance_method, candidate_sites),
        n_abstract_analytical_sites_selected=n_abstract_selected,
        method=distance_method,
    )
