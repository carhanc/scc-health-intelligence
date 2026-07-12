"""Location-allocation optimization: OR-Tools maximal-covering-location
model for mobile-clinic/outreach-site scenario planning, per
docs/03_ANALYTICS_METHODS.md §13.

Candidate sites use VTA GTFS high-frequency transit stops (docs §13.2
explicitly lists "transit hubs" as a valid candidate category, and this
is real, available data -- community centers/libraries are not yet
ingested). Demand-to-site coverage uses straight-line distance (DEC-024),
never network travel time. This is a scenario-planning tool: outputs are
explicitly labeled a modeled configuration, never a forecast of avoided
ED visits, dollars saved, or health outcomes (docs §13.4, CLAUDE.md).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from scc_health_pipeline.routing.straight_line import METHOD_LABEL, haversine_miles


@dataclass(frozen=True)
class CandidateSite:
    site_id: str
    label: str
    lat: float
    lon: float


@dataclass(frozen=True)
class DemandPoint:
    tract_geoid_2020: str
    lat: float
    lon: float
    population: float
    need_weight: float  # 0-1, e.g. health_burden domain score / 100


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
    method: str = METHOD_LABEL


_ASSUMPTIONS = [
    "Coverage is a modeled scenario configuration, not a forecast of avoided ED visits, "
    "dollars saved, or health outcomes.",
    "Distance is straight-line ('as the crow flies'), not network travel time (Phase 6 scope).",
    "Candidate sites are VTA GTFS high-frequency transit stops; community centers, libraries, "
    "and other public-site categories from docs/03 §13.2 are not yet ingested.",
    "Demand is represented at the tract level (internal point), not population-weighted "
    "sub-tract centroids (docs/03 §2.5's preferred finer-grained origins are Phase 6 scope).",
]


def run_maximal_covering_location(
    candidate_sites: list[CandidateSite],
    demand_points: list[DemandPoint],
    k_sites: int,
    distance_threshold_miles: float,
    high_need_percentile_threshold: float = 75.0,
    equity_min_coverage_fraction: float | None = None,
    time_limit_seconds: float = 15.0,
) -> OptimizationResult:
    if not candidate_sites or not demand_points or k_sites <= 0:
        return OptimizationResult(
            status="INVALID_INPUT",
            objective_value=None,
            k_sites=k_sites,
            distance_threshold_miles=distance_threshold_miles,
            assumptions=_ASSUMPTIONS,
        )

    # Coverage matrix: covering_sites[i] = list of candidate indices within threshold of demand i.
    covering_sites: list[list[int]] = []
    for d in demand_points:
        covers = [
            j
            for j, s in enumerate(candidate_sites)
            if haversine_miles(d.lat, d.lon, s.lat, s.lon) <= distance_threshold_miles
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
            assumptions=_ASSUMPTIONS,
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
        assumptions=_ASSUMPTIONS,
    )
