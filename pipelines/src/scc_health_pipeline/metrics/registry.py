"""Metric registry: loads config/metrics.yml into typed MetricDefinition
objects and evaluates each metric against the warehouse into a per-tract
raw-value table.

Implements docs/03_ANALYTICS_METHODS.md §3 (Metric registry) as a real,
enforced schema -- not ad hoc column matching (§3: "This registry, not ad
hoc column matching, drives scoring and UI labels"). No formula is
duplicated elsewhere: `scoring/domain_scores.py` and the API both read
metric metadata from here, never hardcode a domain/subdomain/direction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import duckdb
import polars as pl
import yaml

Direction = Literal["concern_high", "concern_low", "neutral"]
TransformType = Literal["none", "acs_ratio", "acs_sum_ratio", "precomputed"]
UncertaintyType = Literal["acs_moe", "places_ci", "none"]


class MetricRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class MetricDefinition:
    metric_id: str
    label: str
    domain: str
    subdomain: str
    source_id: str
    source_table: str
    unit: str
    direction: Direction
    transform: TransformType
    uncertainty_type: UncertaintyType
    minimum_coverage: float
    allowed_geographies: list[str]
    plain_language_definition: str
    interpretation: str
    limitations: str
    citation: str
    # transform-specific fields, only some populated depending on `transform`
    source_field: str | None = None
    source_filter: dict[str, str] = field(default_factory=dict)
    numerator_variable: str | None = None
    denominator_variable: str | None = None
    numerator_variables: list[str] = field(default_factory=list)
    denominator_variable_sum: str | None = None
    winsorization_enabled: bool = False
    winsorization_lower_pct: float = 1.0
    winsorization_upper_pct: float = 99.0
    population_denominator: str | None = None


_REQUIRED_FIELDS = {
    "metric_id",
    "label",
    "domain",
    "subdomain",
    "source_id",
    "source_table",
    "unit",
    "direction",
    "transform",
    "uncertainty_type",
    "minimum_coverage",
    "allowed_geographies",
    "plain_language_definition",
    "interpretation",
    "limitations",
    "citation",
}


def load_metric_registry(path: Path) -> list[MetricDefinition]:
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    entries = raw.get("metrics", []) if raw else []

    definitions: list[MetricDefinition] = []
    seen_ids: set[str] = set()
    for entry in entries:
        missing = _REQUIRED_FIELDS - entry.keys()
        if missing:
            raise MetricRegistryError(
                f"metric {entry.get('metric_id', '<unknown>')} is missing required "
                f"field(s): {sorted(missing)}"
            )
        metric_id = entry["metric_id"]
        if metric_id in seen_ids:
            raise MetricRegistryError(f"duplicate metric_id: {metric_id}")
        seen_ids.add(metric_id)

        winsor = entry.get("winsorization", {}) or {}
        definitions.append(
            MetricDefinition(
                metric_id=metric_id,
                label=entry["label"],
                domain=entry["domain"],
                subdomain=entry["subdomain"],
                source_id=entry["source_id"],
                source_table=entry["source_table"],
                unit=entry["unit"],
                direction=entry["direction"],
                transform=entry["transform"],
                uncertainty_type=entry["uncertainty_type"],
                minimum_coverage=float(entry["minimum_coverage"]),
                allowed_geographies=list(entry["allowed_geographies"]),
                plain_language_definition=entry["plain_language_definition"],
                interpretation=entry["interpretation"],
                limitations=entry["limitations"],
                citation=entry["citation"],
                source_field=entry.get("source_field"),
                source_filter=entry.get("source_filter", {}) or {},
                numerator_variable=entry.get("numerator_variable"),
                denominator_variable=entry.get("denominator_variable"),
                numerator_variables=entry.get("numerator_variables", []) or [],
                denominator_variable_sum=entry.get("denominator_variable_sum"),
                winsorization_enabled=bool(winsor.get("enabled", False)),
                winsorization_lower_pct=float(winsor.get("lower_pct", 1.0)),
                winsorization_upper_pct=float(winsor.get("upper_pct", 99.0)),
                population_denominator=entry.get("population_denominator"),
            )
        )
    return definitions


def validate_registry_against_warehouse(
    conn: duckdb.DuckDBPyConnection, definitions: list[MetricDefinition]
) -> list[str]:
    """Returns a list of human-readable problems (empty if all clear).
    Confirms every referenced table/column genuinely exists -- catches a
    typo'd metric definition at registry-load time rather than producing
    a silent all-null metric downstream."""
    problems: list[str] = []
    for d in definitions:
        schema, table = d.source_table.split(".")
        exists = conn.execute(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = ? AND table_name = ?",
            [schema, table],
        ).fetchone()
        if not exists or exists[0] == 0:
            problems.append(f"{d.metric_id}: source_table {d.source_table} does not exist")
            continue
        columns = {
            r[0]
            for r in conn.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = ? AND table_name = ?",
                [schema, table],
            ).fetchall()
        }
        if d.transform == "none" and d.source_field and d.source_field not in columns:
            problems.append(
                f"{d.metric_id}: source_field {d.source_field} not found in {d.source_table}"
            )
    return problems


def evaluate_metric(conn: duckdb.DuckDBPyConnection, d: MetricDefinition) -> pl.DataFrame:
    """Returns a DataFrame with columns: tract_geoid_2020, raw_value, and
    (when available) standard_error, low_confidence_limit,
    high_confidence_limit -- the per-tract raw values for one metric,
    straight from the warehouse, no scoring applied yet."""
    if d.transform == "none":
        return _evaluate_direct(conn, d)
    if d.transform == "precomputed":
        return _evaluate_direct(conn, d)
    if d.transform == "acs_ratio":
        return _evaluate_acs_ratio(conn, d)
    if d.transform == "acs_sum_ratio":
        return _evaluate_acs_sum_ratio(conn, d)
    raise MetricRegistryError(f"Unknown transform type: {d.transform}")


def _evaluate_direct(conn: duckdb.DuckDBPyConnection, d: MetricDefinition) -> pl.DataFrame:
    where_clauses = [f"{col} = '{val}'" for col, val in d.source_filter.items()]
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    uncertainty_cols = ""
    if d.uncertainty_type == "places_ci":
        uncertainty_cols = ", low_confidence_limit, high_confidence_limit"
    elif d.uncertainty_type == "acs_moe":
        uncertainty_cols = ", standard_error"

    sql = f"""
        SELECT tract_geoid_2020, {d.source_field} AS raw_value{uncertainty_cols}
        FROM {d.source_table}
        {where_sql}
    """
    return conn.execute(sql).pl()


def _evaluate_acs_ratio(conn: duckdb.DuckDBPyConnection, d: MetricDefinition) -> pl.DataFrame:
    sql = f"""
        SELECT
            num.tract_geoid_2020,
            (num.estimate / NULLIF(den.estimate, 0)) * 100.0 AS raw_value,
            -- Propagated relative-MOE approximation for a ratio of two
            -- ACS estimates (docs/03 §2.3: "use Census-recommended
            -- formulas where possible; if using an approximation,
            -- record it" -- recorded here and in DATA_DICTIONARY.md).
            SQRT(
                POWER(num.moe_90 / NULLIF(num.estimate, 0), 2)
                + POWER(den.moe_90 / NULLIF(den.estimate, 0), 2)
            ) * (num.estimate / NULLIF(den.estimate, 0)) * 100.0 / 1.645 AS standard_error
        FROM {d.source_table} num
        JOIN {d.source_table} den ON num.tract_geoid_2020 = den.tract_geoid_2020
        WHERE num.variable_id = '{d.numerator_variable}'
          AND den.variable_id = '{d.denominator_variable}'
    """
    return conn.execute(sql).pl()


def _evaluate_acs_sum_ratio(conn: duckdb.DuckDBPyConnection, d: MetricDefinition) -> pl.DataFrame:
    numerator_list = ", ".join(f"'{v}'" for v in d.numerator_variables)
    sql = f"""
        WITH numerator_sum AS (
            SELECT tract_geoid_2020, SUM(estimate) AS numerator_estimate,
                   COUNT(*) AS n_lines_present
            FROM {d.source_table}
            WHERE variable_id IN ({numerator_list})
            GROUP BY tract_geoid_2020
        )
        SELECT
            n.tract_geoid_2020,
            CASE WHEN n.n_lines_present = {len(d.numerator_variables)}
                 THEN (n.numerator_estimate / NULLIF(den.estimate, 0)) * 100.0
                 ELSE NULL
            END AS raw_value
        FROM numerator_sum n
        JOIN {d.source_table} den
          ON n.tract_geoid_2020 = den.tract_geoid_2020
         AND den.variable_id = '{d.denominator_variable_sum}'
    """
    return conn.execute(sql).pl()
