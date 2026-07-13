"""Phase 7 Validate API: uncertainty/sensitivity summaries, persisted
audit status, known limitations, and reproducibility metadata.

Data coverage is intentionally NOT duplicated here -- reuse the existing
`/api/v1/sources` and `/api/v1/data-explorer` endpoints (Phase 1/3).
Per-tract uncertainty/explainability is not duplicated either -- reuse
`/api/v1/scenarios/{id}/scores` and `/api/v1/scenarios/{id}/tracts/{tract}/explain`
(Phase 4). This module only adds genuinely new *aggregate* views those
per-tract endpoints do not provide, plus audit/reproducibility metadata
that was not exposed via API before Phase 7.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import duckdb
from fastapi import APIRouter, Depends, HTTPException

from scc_health_api.db import WarehouseUnavailableError, get_read_only_connection
from scc_health_api.schemas.validate import (
    AuditCheckResult,
    AuditStatusResponse,
    AuditSuiteResult,
    BuildRecord,
    KnownLimitation,
    KnownLimitationsResponse,
    PresetComparisonRow,
    ReproducibilityResponse,
    ScenarioHash,
    SensitivitySummary,
    StabilityLabelCount,
    UncertaintySummary,
)
from scc_health_api.services.analytics_config import (
    load_scenario_metadata,
    load_sensitivity_preset_metadata,
)
from scc_health_api.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/validate", tags=["validate"])

REPO_ROOT = Path(__file__).resolve().parents[5]
DATA_MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"

_ANALYTICS_UNAVAILABLE_DETAIL = (
    "Phase 4 analytics tables are not present in the current warehouse. Run `make data` first."
)

MONTE_CARLO_SEED = 42
MONTE_CARLO_DRAWS = 500
WEIGHT_SENSITIVITY_SEED = 42
WEIGHT_SENSITIVITY_DRAWS = 1000


def _require_table(conn: duckdb.DuckDBPyConnection, table: str) -> None:
    row = conn.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = 'analytics' AND table_name = ?",
        [table],
    ).fetchone()
    if not row or row[0] == 0:
        raise HTTPException(status_code=503, detail=_ANALYTICS_UNAVAILABLE_DETAIL)


def _get_scenario_label(scenario_id: str) -> str:
    for s in load_scenario_metadata():
        if s.scenario_id == scenario_id:
            return s.label
    raise HTTPException(status_code=404, detail=f"Unknown scenario_id: {scenario_id}")


@router.get("/uncertainty-summary", response_model=UncertaintySummary)
def get_uncertainty_summary(
    scenario_id: str, settings: Settings = Depends(get_settings)
) -> UncertaintySummary:
    label = _get_scenario_label(scenario_id)
    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "stability_labels")
            _require_table(conn, "scenario_scores")

            (n_scored,) = conn.execute(
                "SELECT COUNT(*) FROM analytics.scenario_scores "
                "WHERE scenario_id = ? AND score IS NOT NULL",
                [scenario_id],
            ).fetchone()  # type: ignore[misc]
            (n_total,) = conn.execute(
                "SELECT COUNT(*) FROM analytics.scenario_scores WHERE scenario_id = ?",
                [scenario_id],
            ).fetchone()  # type: ignore[misc]

            label_rows = conn.execute(
                "SELECT stability_label, COUNT(*) FROM analytics.stability_labels "
                "WHERE scenario_id = ? GROUP BY stability_label",
                [scenario_id],
            ).fetchall()

            (median_ci_width,) = conn.execute(
                "SELECT MEDIAN(ci_upper - ci_lower) FROM analytics.monte_carlo_results "
                "WHERE scenario_id = ? AND ci_upper IS NOT NULL AND ci_lower IS NOT NULL",
                [scenario_id],
            ).fetchone()  # type: ignore[misc]

            (mean_prob,) = conn.execute(
                """
                SELECT AVG(mc.probability_top_decile)
                FROM analytics.monte_carlo_results mc
                JOIN analytics.scenario_scores s
                  ON mc.tract_geoid_2020 = s.tract_geoid_2020 AND mc.scenario_id = s.scenario_id
                WHERE mc.scenario_id = ? AND s.score IS NOT NULL
                  AND s.tract_geoid_2020 IN (
                    SELECT tract_geoid_2020 FROM analytics.scenario_scores
                    WHERE scenario_id = ? AND score IS NOT NULL
                    ORDER BY score DESC LIMIT (
                      SELECT GREATEST(1, CAST(COUNT(*) * 0.1 AS INTEGER))
                      FROM analytics.scenario_scores WHERE scenario_id = ? AND score IS NOT NULL
                    )
                  )
                """,
                [scenario_id, scenario_id, scenario_id],
            ).fetchone()  # type: ignore[misc]
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    n_data_limited = n_total - n_scored

    return UncertaintySummary(
        data_mode=mode,
        scenario_id=scenario_id,
        scenario_label=label,
        n_tracts_scored=n_scored,
        n_tracts_data_limited=n_data_limited,
        stability_label_counts=[
            StabilityLabelCount(stability_label=label_val, n_tracts=count)
            for label_val, count in label_rows
        ],
        median_ci_width=median_ci_width,
        mean_probability_top_decile_among_top_decile=mean_prob,
        note=(
            f"Uncertainty is estimated by {MONTE_CARLO_DRAWS} Monte Carlo draws per tract "
            f"(seed {MONTE_CARLO_SEED}), perturbing each contributing metric within its own "
            "reported margin of error. A tract with no score (data-limited) has too few present "
            "domains to compute a combined score at all -- its uncertainty is not estimated, "
            "not assumed to be zero."
        ),
    )


@router.get("/sensitivity-summary", response_model=SensitivitySummary)
def get_sensitivity_summary(
    scenario_id: str, settings: Settings = Depends(get_settings)
) -> SensitivitySummary:
    label = _get_scenario_label(scenario_id)
    presets = load_sensitivity_preset_metadata()

    try:
        with get_read_only_connection(settings) as (conn, mode):
            _require_table(conn, "preset_scenario_scores")
            _require_table(conn, "scenario_scores")

            named_rows = conn.execute(
                "SELECT tract_geoid_2020, score FROM analytics.scenario_scores "
                "WHERE scenario_id = ? AND score IS NOT NULL",
                [scenario_id],
            ).fetchall()
            named_by_tract = dict(named_rows)

            comparisons = []
            for preset in presets:
                preset_rows = conn.execute(
                    "SELECT tract_geoid_2020, score FROM analytics.preset_scenario_scores "
                    "WHERE preset_id = ? AND score IS NOT NULL",
                    [preset.preset_id],
                ).fetchall()
                preset_by_tract = dict(preset_rows)
                common = sorted(set(named_by_tract) & set(preset_by_tract))
                corr = None
                if len(common) >= 3:
                    x = [named_by_tract[t] for t in common]
                    y = [preset_by_tract[t] for t in common]
                    corr = _spearman(x, y)
                comparisons.append(
                    PresetComparisonRow(
                        preset_id=preset.preset_id,
                        preset_label=preset.label,
                        spearman_rank_correlation_vs_named_scenario=corr,
                        n_paired_tracts=len(common),
                    )
                )
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return SensitivitySummary(
        data_mode=mode,
        scenario_id=scenario_id,
        scenario_label=label,
        preset_comparisons=comparisons,
        note=(
            f"Each row compares this scenario's own ranking to what the same tracts would rank "
            f"under one of 5 alternate, globally-fixed weightings (evaluated with "
            f"{WEIGHT_SENSITIVITY_DRAWS} weight-perturbation draws per tract, seed "
            f"{WEIGHT_SENSITIVITY_SEED}). A rank correlation near 1.0 means this scenario's "
            "priorities are robust to that alternate weighting; a lower value means the "
            "ranking is more assumption-sensitive."
        ),
        optimizer_sensitivity_note=(
            "Mobile-clinic siting sensitivity (varying site count, distance threshold, and "
            "equity constraint) is available at GET /api/v1/optimization/runs -- see the "
            "Access Lab optimizer scenarios."
        ),
    )


def _rank(values: list[float]) -> list[float]:
    """Average (fractional) ranks, so tied values share the mean rank of
    the positions they occupy -- the standard tie-handling convention for
    Spearman's rho, matching scipy.stats.rankdata(method='average')."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg_rank = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    return ranks


def _spearman(x: list[float], y: list[float]) -> float | None:
    """Dependency-free Spearman rank correlation -- the API package does
    not declare a scipy dependency (DEC-022's isolation boundary), unlike
    the pipeline package which uses scipy.stats.spearmanr for the same
    computation with bootstrap CIs (validation/correlation_diagnostics.py)."""
    if len(x) < 3:
        return None
    rx, ry = _rank(x), _rank(y)
    n = len(rx)
    mean_rx, mean_ry = sum(rx) / n, sum(ry) / n
    cov = sum((rx[i] - mean_rx) * (ry[i] - mean_ry) for i in range(n))
    var_x = sum((v - mean_rx) ** 2 for v in rx)
    var_y = sum((v - mean_ry) ** 2 for v in ry)
    denom = (var_x * var_y) ** 0.5
    return None if denom == 0 else cov / denom


@router.get("/audit-status", response_model=AuditStatusResponse)
def get_audit_status(settings: Settings = Depends(get_settings)) -> AuditStatusResponse:
    try:
        with get_read_only_connection(settings) as (conn, mode):
            row = conn.execute(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'meta' AND table_name = 'audit_runs'"
            ).fetchone()
            if not row or row[0] == 0:
                raise HTTPException(
                    status_code=503,
                    detail="No audit run has been persisted yet. Run `make audit` first.",
                )
            (run_at,) = conn.execute("SELECT MAX(run_at) FROM meta.audit_runs").fetchone()  # type: ignore[misc]
            rows = conn.execute(
                "SELECT suite, check_name, passed, message FROM meta.audit_runs "
                "WHERE run_at = ? ORDER BY suite, check_name",
                [run_at],
            ).fetchall()
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    suites: dict[str, list[AuditCheckResult]] = {}
    for suite, check_name, passed, message in rows:
        suites.setdefault(suite, []).append(
            AuditCheckResult(check_name=check_name, passed=passed, message=message)
        )

    suite_results = [
        AuditSuiteResult(
            suite=suite,
            n_checks=len(checks),
            n_passed=sum(1 for c in checks if c.passed),
            n_failed=sum(1 for c in checks if not c.passed),
            checks=checks,
        )
        for suite, checks in sorted(suites.items())
    ]
    return AuditStatusResponse(
        data_mode=mode,
        run_at=run_at,
        all_passed=all(s.n_failed == 0 for s in suite_results),
        suites=suite_results,
    )


_KNOWN_LIMITATIONS = [
    KnownLimitation(
        category="Causal interpretation",
        statement=(
            "Every score, correlation, and ranking on this platform is an association or a "
            "modeled screening estimate, never a causal claim. A high-priority tract is a "
            "candidate for closer investigation, not proof that any specific factor is causing "
            "harm there or that any specific intervention would fix it."
        ),
    ),
    KnownLimitation(
        category="Individual-level risk",
        statement=(
            "All scores are tract-level aggregates built from published public statistics. "
            "They must never be read as a risk estimate, diagnosis, or characterization of any "
            "individual person living in that tract."
        ),
    ),
    KnownLimitation(
        category="Program impact",
        statement=(
            "Nothing on this platform estimates or guarantees the impact of a program, policy, "
            "or intervention. Modeled access-improvement and coverage figures describe what an "
            "optimizer's site selection could reach under stated assumptions, not what a real "
            "program would achieve."
        ),
    ),
    KnownLimitation(
        category="Transit access modeling",
        statement=(
            "Transit access uses published (static/scheduled) GTFS frequency, not real-time "
            "vehicle positions, service disruptions, or crowding -- see "
            "'scheduled_transit_access_proxy' labels throughout the Access Lab."
        ),
    ),
    KnownLimitation(
        category="Routing model",
        statement=(
            "Drive and walk network routing uses free-flow travel times from OpenStreetMap way "
            "types, not live traffic conditions, and pedestrian speed is a constant assumption, "
            "not derived from terrain or sidewalk quality."
        ),
    ),
    KnownLimitation(
        category="Capacity proxies",
        statement=(
            "Facility capacity is real licensed-bed counts only for hospitals; other facility "
            "categories use a count-based proxy (capacity_type='count_proxy') because no public "
            "capacity figure exists for them -- these two capacity types are never combined."
        ),
    ),
    KnownLimitation(
        category="ZIP-to-tract crosswalk uncertainty",
        statement=(
            "Any figure allocated from ZIP/ZCTA level down to the census tract (e.g. modeled "
            "emergency-department utilization) uses the Census ZCTA-to-tract land-area "
            "relationship, which assumes activity is spread evenly across a ZIP's land area. "
            "This is unreliable for a small number of large, sparsely-populated tracts -- "
            "flagged individually as 'low_reliability' rather than presented as an ordinary "
            "modeled value."
        ),
    ),
    KnownLimitation(
        category="Public-data suppression",
        statement=(
            "Some published HCAI and CDC PLACES cells are suppressed for small-number privacy "
            "protection. Suppressed cells are always shown as unavailable (null), never as zero "
            "or silently excluded from totals -- see the affected table's 'is_suppressed' flag."
        ),
    ),
    KnownLimitation(
        category="Scenario coverage gaps",
        statement=(
            "No tract-level 'language access' scenario exists yet -- no language-barrier metric "
            "feeds any scored domain. Rather than build a scenario that reweights unrelated "
            "domains under a misleading label, this option is shown as unavailable with a "
            "documented reason (see DECISIONS.md DEC-027)."
        ),
    ),
]


@router.get("/known-limitations", response_model=KnownLimitationsResponse)
def get_known_limitations() -> KnownLimitationsResponse:
    return KnownLimitationsResponse(limitations=_KNOWN_LIMITATIONS)


def _weights_hash(weights: dict[str, float]) -> str:
    canonical = json.dumps(dict(sorted(weights.items())), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _load_manifest_count() -> int:
    if not DATA_MANIFEST_PATH.exists():
        return 0
    with DATA_MANIFEST_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return len(data)


@router.get("/reproducibility", response_model=ReproducibilityResponse)
def get_reproducibility(settings: Settings = Depends(get_settings)) -> ReproducibilityResponse:
    scenarios = load_scenario_metadata()
    scenario_hashes = [
        ScenarioHash(
            scenario_id=s.scenario_id, label=s.label, weights_hash=_weights_hash(s.weights)
        )
        for s in scenarios
    ]

    try:
        with get_read_only_connection(settings) as (conn, mode):
            row = conn.execute(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'meta' AND table_name = 'builds'"
            ).fetchone()
            builds: list[BuildRecord] = []
            if row and row[0] > 0:
                build_rows = conn.execute(
                    "SELECT build_id, phase, finished_at, notes FROM meta.builds "
                    "ORDER BY finished_at DESC LIMIT 20"
                ).fetchall()
                builds = [
                    BuildRecord(build_id=b[0], phase=b[1], finished_at=b[2], notes=b[3] or "")
                    for b in build_rows
                ]
    except WarehouseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ReproducibilityResponse(
        data_mode=mode,
        scenario_hashes=scenario_hashes,
        recent_builds=builds,
        data_manifest_source_count=_load_manifest_count(),
        monte_carlo_seed=MONTE_CARLO_SEED,
        monte_carlo_draws=MONTE_CARLO_DRAWS,
        weight_sensitivity_seed=WEIGHT_SENSITIVITY_SEED,
        weight_sensitivity_draws=WEIGHT_SENSITIVITY_DRAWS,
        note=(
            "A scenario's weights_hash changes if and only if its weight vector changes, so two "
            "sessions reporting the same hash for a scenario_id are guaranteed to be scoring "
            "with identical weights. All stochastic computations (Monte Carlo uncertainty, "
            "weight sensitivity) use a fixed seed, so re-running the pipeline against the same "
            "input data reproduces identical output -- see DATA_MANIFEST.json for full source "
            "provenance and checksums."
        ),
    )
