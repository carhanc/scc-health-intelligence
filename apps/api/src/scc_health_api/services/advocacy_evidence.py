"""Evidence assembly for Advocate/Document Intelligence/Copilot (Phase 8).

Builds `EvidenceItem` objects -- the one common, fully-cited shape every
Phase 8 surface consumes -- directly from already-computed, already-tested
`analytics.*`/`resources.*` tables (DEC-030's read-only-presentation-layer
boundary, unchanged). No score, percentile, or access figure is
recomputed here.

A city/ZIP/supervisor-district geography is not itself a scored unit
(scores are computed per census tract) -- evidence for one is a
disclosed **average across its member tracts**, never presented as a
single tract's real figure. This is a deliberate Phase 8 scope choice
(recorded in DECISIONS.md): a full population-weighted place-level
re-aggregation is out of scope this phase.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

from scc_health_api.schemas.advocacy import EvidenceItem

REPO_ROOT = Path(__file__).resolve().parents[5]
DATA_MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _load_manifest_by_source_id() -> dict[str, dict[str, Any]]:
    if not DATA_MANIFEST_PATH.exists():
        return {}
    with DATA_MANIFEST_PATH.open(encoding="utf-8") as fh:
        entries: list[dict[str, Any]] = json.load(fh)
    return {e["source_id"]: e for e in entries}


def resolve_member_tracts(
    conn: duckdb.DuckDBPyConnection, geography_type: str, geography_id: str
) -> list[str]:
    """The tract or tracts a geography's evidence should be built from."""
    if geography_type == "tract":
        row = conn.execute(
            "SELECT tract_geoid_2020 FROM geo.tracts WHERE tract_geoid_2020 = ?", [geography_id]
        ).fetchone()
        return [geography_id] if row else []
    if geography_type == "place":
        rows = conn.execute(
            "SELECT tract_geoid_2020 FROM geo.tract_place_assignment WHERE place_geoid = ?",
            [geography_id],
        ).fetchall()
        return [r[0] for r in rows]
    if geography_type == "supervisor_district":
        rows = conn.execute(
            "SELECT tract_geoid_2020 FROM geo.tract_supervisor_district_assignment "
            "WHERE supervisor_district = ?",
            [int(geography_id)],
        ).fetchall()
        return [r[0] for r in rows]
    if geography_type == "zcta":
        rows = conn.execute(
            "SELECT DISTINCT tract_geoid_2020 FROM geo.crosswalk_zip_tract WHERE zcta_geoid = ?",
            [geography_id],
        ).fetchall()
        return [r[0] for r in rows]
    return []


def _geography_label(
    conn: duckdb.DuckDBPyConnection, geography_type: str, geography_id: str
) -> str:
    if geography_type == "tract":
        row = conn.execute(
            "SELECT name_long FROM geo.tracts WHERE tract_geoid_2020 = ?", [geography_id]
        ).fetchone()
        return row[0] if row else f"Tract {geography_id}"
    if geography_type == "place":
        row = conn.execute(
            "SELECT name FROM geo.places WHERE place_geoid = ?", [geography_id]
        ).fetchone()
        return row[0] if row else geography_id
    if geography_type == "supervisor_district":
        return f"Supervisor District {geography_id}"
    if geography_type == "zcta":
        return f"ZIP Code Tabulation Area {geography_id}"
    return geography_id


def build_metric_evidence(
    conn: duckdb.DuckDBPyConnection,
    tracts: list[str],
    scenario_id: str,
    manifest: dict[str, dict[str, Any]],
) -> list[EvidenceItem]:
    if not tracts:
        return []
    placeholders = ",".join("?" for _ in tracts)
    rows = conn.execute(
        f"""
        SELECT metric_id, label, raw_value, unit, percentile, source_id, citation,
               plain_language_definition, limitations
        FROM analytics.metric_contributions
        WHERE scenario_id = ? AND tract_geoid_2020 IN ({placeholders})
        """,
        [scenario_id, *tracts],
    ).fetchall()

    by_metric: dict[str, list[tuple[Any, ...]]] = {}
    for row in rows:
        by_metric.setdefault(row[0], []).append(row)

    n = len(tracts)
    items: list[EvidenceItem] = []
    for metric_id, metric_rows in by_metric.items():
        first = metric_rows[0]
        raw_values = [r[2] for r in metric_rows if r[2] is not None]
        percentiles = [r[4] for r in metric_rows if r[4] is not None]
        avg_raw = sum(raw_values) / len(raw_values) if raw_values else None
        avg_pct = sum(percentiles) / len(percentiles) if percentiles else None
        source_id = first[5]
        manifest_entry = manifest.get(source_id, {})
        pct_suffix = (
            f" ({_ordinal(round(avg_pct))} percentile countywide)" if avg_pct is not None else ""
        )
        value_str = (
            f"{avg_raw:.1f} {first[3]}".strip() + pct_suffix
            if avg_raw is not None
            else "Not available"
        )
        if n > 1:
            value_str += f" (average across {len(raw_values)} of {n} tracts)"
        items.append(
            EvidenceItem(
                evidence_id=f"metric:{metric_id}:{scenario_id}:{'+'.join(sorted(tracts))}",
                category="metric",
                label=first[1],
                value=value_str,
                raw_value=avg_raw,
                unit=first[3],
                geography_type="tract" if n == 1 else "aggregate",
                geography_id=tracts[0] if n == 1 else "+".join(tracts),
                geography_label=first[1],
                data_status="observed" if n == 1 else "derived",
                publisher=manifest_entry.get("publisher", "Unknown publisher"),
                source_vintage=manifest_entry.get("source_vintage", "Unknown vintage"),
                retrieved_at=manifest_entry.get("retrieved_at", "Unknown"),
                method="direct" if n == 1 else "unweighted_average_across_member_tracts",
                uncertainty_note=(
                    f"Reflects {len(raw_values)} of {n} member tracts with a real value."
                    if n > 1
                    else None
                ),
                limitation=first[8],
                citation=first[6],
                source_url=None,
            )
        )
    return items


def build_scenario_score_evidence(
    conn: duckdb.DuckDBPyConnection, tracts: list[str], scenario_id: str, scenario_label: str
) -> EvidenceItem | None:
    if not tracts:
        return None
    placeholders = ",".join("?" for _ in tracts)
    rows = conn.execute(
        f"""
        SELECT score, coverage_fraction FROM analytics.scenario_scores
        WHERE scenario_id = ? AND tract_geoid_2020 IN ({placeholders}) AND score IS NOT NULL
        """,
        [scenario_id, *tracts],
    ).fetchall()
    if not rows:
        return None
    scores = [r[0] for r in rows]
    avg_score = sum(scores) / len(scores)
    avg_coverage = sum(r[1] for r in rows) / len(rows)
    n = len(tracts)
    return EvidenceItem(
        evidence_id=f"scenario_score:{scenario_id}:{'+'.join(sorted(tracts))}",
        category="scenario_score",
        label=f"Combined priority score -- {scenario_label}",
        value=(
            f"{avg_score:.1f} / 100"
            + (f" (average across {len(rows)} of {n} tracts)" if n > 1 else "")
        ),
        raw_value=avg_score,
        unit="score (0-100)",
        geography_type="tract" if n == 1 else "aggregate",
        geography_id=tracts[0] if n == 1 else "+".join(tracts),
        geography_label=scenario_label,
        data_status="derived",
        publisher="Santa Clara Health Intelligence (this platform)",
        source_vintage="current build",
        retrieved_at="computed at analytics build time",
        method=(
            "weighted_domain_aggregation" if n == 1 else "unweighted_average_across_member_tracts"
        ),
        uncertainty_note=f"Average data coverage: {avg_coverage:.0%}",
        limitation="A screening score, not a prediction or a guarantee of program impact.",
        citation=(
            "Santa Clara Health Intelligence scoring engine (see Validate page for methodology)."
        ),
        source_url=None,
    )


def build_access_evidence(conn: duckdb.DuckDBPyConnection, tracts: list[str]) -> list[EvidenceItem]:
    if not tracts:
        return []
    placeholders = ",".join("?" for _ in tracts)
    rows = conn.execute(
        f"""
        SELECT category, mode, AVG(accessibility_score) AS avg_score, COUNT(*) AS n
        FROM analytics.e2sfca_accessibility
        WHERE tract_geoid_2020 IN ({placeholders})
        GROUP BY category, mode
        """,
        tracts,
    ).fetchall()
    n_tracts = len(tracts)
    items = []
    for category, mode, avg_score, _n in rows:
        value_suffix = f" (average across {n_tracts} tracts)" if n_tracts > 1 else ""
        items.append(
            EvidenceItem(
                evidence_id=f"access:{category}:{mode}:{'+'.join(sorted(tracts))}",
                category="access",
                label=f"{category.capitalize()} access score ({mode})",
                value=f"{avg_score:.3f}" + value_suffix,
                raw_value=float(avg_score),
                unit="E2SFCA accessibility score",
                geography_type="tract" if n_tracts == 1 else "aggregate",
                geography_id=tracts[0] if n_tracts == 1 else "+".join(tracts),
                geography_label=f"{category} access",
                data_status="derived",
                publisher="Santa Clara Health Intelligence (this platform)",
                source_vintage="current build",
                retrieved_at="computed at analytics build time",
                method="e2sfca_gaussian_decay",
                uncertainty_note=None,
                limitation=(
                    "Relative accessibility, not an absolute measure of care adequacy -- see "
                    "Access Lab."
                ),
                citation=(
                    "Enhanced Two-Step Floating Catchment Area (E2SFCA) analysis "
                    "(see docs/methods/e2sfca.md)."
                ),
                source_url=None,
            )
        )
    return items


def build_utilization_evidence(
    conn: duckdb.DuckDBPyConnection, tracts: list[str]
) -> list[EvidenceItem]:
    if not tracts:
        return []
    placeholders = ",".join("?" for _ in tracts)
    rows = conn.execute(
        f"""
        SELECT modeled_ed_rate_per_1000, rate_reliability
        FROM analytics.utilization_access_vs_utilization
        WHERE tract_geoid_2020 IN ({placeholders}) AND modeled_ed_rate_per_1000 IS NOT NULL
        """,
        tracts,
    ).fetchall()
    if not rows:
        return []
    n_tracts = len(tracts)
    rates = [r[0] for r in rows]
    avg_rate = sum(rates) / len(rates)
    any_low_reliability = any(r[1] == "low_reliability" for r in rows)
    return [
        EvidenceItem(
            evidence_id=f"utilization:ed_rate:{'+'.join(sorted(tracts))}",
            category="utilization",
            label="Modeled emergency-department visit rate",
            value=(
                f"{avg_rate:.0f} per 1,000 residents"
                + (f" (average across {len(rows)} of {n_tracts} tracts)" if n_tracts > 1 else "")
            ),
            raw_value=avg_rate,
            unit="visits per 1,000 residents",
            geography_type="tract" if n_tracts == 1 else "aggregate",
            geography_id=tracts[0] if n_tracts == 1 else "+".join(tracts),
            geography_label="Modeled ED utilization",
            data_status="modeled",
            publisher="California Department of Health Care Access and Information (HCAI)",
            source_vintage="2024",
            retrieved_at="2026-07-13",
            method="zip_to_tract_area_weighted_allocation",
            uncertainty_note=(
                "One or more contributing tracts is flagged low-reliability due to area-weighting "
                "artifacts." if any_low_reliability else None
            ),
            limitation=(
                "A modeled allocation from real ZIP-level HCAI data, not a directly observed "
                "tract-level count -- see Utilization page."
            ),
            citation=(
                "HCAI Patient Origin/Market Share (Pivot Profile), 2024, allocated to tracts "
                "(see docs/methods/utilization.md)."
            ),
            source_url="https://hcai.ca.gov/data/healthcare-utilization/inpatient/",
        )
    ]


def build_resource_evidence(
    conn: duckdb.DuckDBPyConnection, geography_type: str, geography_id: str, tracts: list[str]
) -> list[EvidenceItem]:
    """A real, observed count of nearby facilities by category -- filtered
    to the geography's own city/place when known, otherwise county-wide as
    a disclosed fallback (never a fabricated proximity claim)."""
    city_row = None
    if geography_type == "place":
        city_row = conn.execute(
            "SELECT name FROM geo.places WHERE place_geoid = ?", [geography_id]
        ).fetchone()
    elif tracts:
        city_row = conn.execute(
            """
            SELECT p.name FROM geo.tract_place_assignment tpa
            JOIN geo.places p ON tpa.place_geoid = p.place_geoid
            WHERE tpa.tract_geoid_2020 = ?
            """,
            [tracts[0]],
        ).fetchone()

    city_name = city_row[0] if city_row else None
    if city_name:
        rows = conn.execute(
            "SELECT category, COUNT(*) FROM resources.canonical_facilities "
            "WHERE city ILIKE ? GROUP BY category",
            [city_name],
        ).fetchall()
        scope_label = city_name
    else:
        rows = conn.execute(
            "SELECT category, COUNT(*) FROM resources.canonical_facilities GROUP BY category"
        ).fetchall()
        scope_label = "Santa Clara County"

    return [
        EvidenceItem(
            evidence_id=f"resource:{category}:{scope_label}",
            category="resource",
            label=f"{category.replace('_', ' ').capitalize()}s in {scope_label}",
            value=f"{count} known {category.replace('_', ' ')}(s)",
            raw_value=float(count),
            unit="count",
            geography_type=geography_type,
            geography_id=geography_id,
            geography_label=scope_label,
            data_status="observed",
            publisher=(
                "Multiple official/supplemental sources (HCAI, HRSA, SCC Public Health, USDA, VTA)"
            ),
            source_vintage="varies by source -- see Data page",
            retrieved_at="see Data page for per-source retrieval dates",
            method="canonical_facility_deduplication",
            uncertainty_note=None,
            limitation=(
                "A real, deduplicated inventory count -- does not confirm current capacity, "
                "appointment availability, or insurance acceptance."
            ),
            citation="Canonical facility inventory (see Access Lab resource browser).",
            source_url=None,
        )
        for category, count in rows
    ]


def assemble_evidence(
    conn: duckdb.DuckDBPyConnection,
    geography_type: str,
    geography_id: str,
    scenario_id: str | None,
    scenario_label: str | None,
) -> tuple[str, list[EvidenceItem]]:
    """Returns (geography_label, evidence_items). A geography that
    resolves to zero member tracts (a nonexistent or empty ID) returns no
    evidence at all -- `build_resource_evidence`'s county-wide fallback
    is only for a *real* geography with no assigned city, never a stand-in
    for "this geography doesn't exist."""
    manifest = _load_manifest_by_source_id()
    tracts = resolve_member_tracts(conn, geography_type, geography_id)
    geography_label = _geography_label(conn, geography_type, geography_id)

    if not tracts:
        return geography_label, []

    items: list[EvidenceItem] = []
    if scenario_id and scenario_label:
        items.extend(build_metric_evidence(conn, tracts, scenario_id, manifest))
        score_item = build_scenario_score_evidence(conn, tracts, scenario_id, scenario_label)
        if score_item:
            items.append(score_item)
    items.extend(build_access_evidence(conn, tracts))
    items.extend(build_utilization_evidence(conn, tracts))
    items.extend(build_resource_evidence(conn, geography_type, geography_id, tracts))
    return geography_label, items
