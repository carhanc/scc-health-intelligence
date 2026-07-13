"""Phase 7 orchestration: HCAI emergency-department utilization, at its
real native geographies (county, facility, patient ZIP), plus a single
disclosed tract-level *modeled* allocation used to finally close RISK-015
(no independent, tract-level outcome existed to validate scenario scores
against). Loaded into the `analytics` warehouse schema, run after
`run_analytics_pipeline.py` (needs its scenario/domain scores and the
Phase 6 E2SFCA table).

Every table this script writes is one of exactly two kinds, and every
row says which:
  - OBSERVED: a real HCAI count, at HCAI's own native geography (county,
    facility, or patient ZIP). Never re-aggregated to a finer geography
    than the source actually reports.
  - MODELED/DERIVED: a tract-level estimate built by allocating an
    OBSERVED figure through the audited ZCTA-tract area crosswalk
    (`geo.crosswalk_zip_tract`), or a rate computed from an OBSERVED
    count divided by a population/capacity denominator. Always carries
    a `method` field.

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_utilization_pipeline
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb
import polars as pl

from scc_health_pipeline.metrics.registry import load_metric_registry
from scc_health_pipeline.scoring.scenarios import load_scenarios
from scc_health_pipeline.utilization.zip_to_tract_allocation import (
    CrosswalkRow,
    ZipObservedEncounters,
    allocate_zip_encounters_to_tracts,
)
from scc_health_pipeline.validation.correlation_diagnostics import run_correlation_diagnostic

REPO_ROOT = Path(__file__).resolve().parents[3]
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"
SCENARIOS_CONFIG_PATH = REPO_ROOT / "config" / "scenarios.yml"
METRICS_CONFIG_PATH = REPO_ROOT / "config" / "metrics.yml"

# HCAI patient-origin `pattype` values that represent an actual ED
# encounter (excludes "Inpatient" with no ED involvement and "AS Only",
# which is ambulatory surgery and known-incomplete per
# AMBULATORY_SURGERY_EXCLUSION_NOTE). Kept as two separate groups, never
# silently summed, since "seen and discharged" and "seen and admitted"
# are analytically different outcomes.
_ED_PATTYPE_TO_GROUP = {
    "ED Only": "ed_only",
    "Inpatient from ED": "inpatient_from_ed",
}

# Area-weighted ZIP-to-tract allocation assumes ED use is spread evenly
# across a ZIP's *land area* -- this breaks down for a small number of
# very large, sparsely-populated tracts (confirmed live, 2026-07-13: tract
# 06085513500, a large low-population tract in the county's eastern
# hills, holds a >=0.9 area-weight share of several ZCTAs whose real
# population and ED volume are concentrated elsewhere in those same
# ZCTAs, producing a nonsensical rate above 37,000 per 1,000 residents).
# A tract-level rate above this ceiling is flagged, not silently trusted
# -- real-world ED visit rates rarely exceed ~1,000 per 1,000 residents
# per year even in high-utilization populations (CDC NHAMCS puts the
# *national average* around 350-450); the live distribution here has a
# median of 235 and a 95th percentile of 855, consistent with that, so
# 1,000 is a generous ceiling that only catches genuine area-weighting
# artifacts, not real heterogeneity.
IMPLAUSIBLE_RATE_CEILING_PER_1000 = 1000.0
_LOW_RELIABILITY_NOTE = (
    "This tract's modeled rate exceeds a plausible emergency-department utilization ceiling. "
    "This is a known limitation of area-weighted ZIP-to-tract allocation for large, "
    "sparsely-populated tracts, not a real utilization signal -- treat this tract's rate as "
    "unreliable, not as evidence of unusually high ED use."
)

# E2SFCA mode used for the access-vs-utilization comparison: drive is the
# most realistic mode for reaching a hospital ED across Santa Clara
# County (walk-mode hospital access is near-zero for most of the county
# and would make the comparison mostly about walk infeasibility, not
# access-vs-demand).
_ACCESS_COMPARISON_MODE = "drive"
_ACCESS_COMPARISON_CATEGORY = "hospital"


def main() -> int:
    if not WAREHOUSE_PATH.exists():
        print("warehouse/scc_health.duckdb does not exist -- run `make data` up through "
              "run_analytics_pipeline first.")
        return 1

    conn = duckdb.connect(str(WAREHOUSE_PATH))
    conn.execute("CREATE SCHEMA IF NOT EXISTS analytics")

    print("Aggregating observed ED encounters by patient ZIP "
          "(Santa Clara County residents only, from hcai_patient_origin)...")
    zip_df = _build_zip_observed(conn)
    _write_table(conn, "analytics", "utilization_ed_zip_observed", zip_df)

    print("Allocating ZIP-level observed encounters to tracts "
          "(modeled, via geo.crosswalk_zip_tract area weights)...")
    tract_df, diag = _build_tract_modeled(conn, zip_df)
    _write_table(conn, "analytics", "utilization_ed_tract_modeled", tract_df)
    print(
        f"  observed={diag_total_observed(diag)}, modeled={diag_total_modeled(diag):.1f}, "
        f"unmatched_zips={diag['n_unmatched_zips']} "
        f"(unmatched_encounters={diag['unmatched_zip_encounters']})"
    )

    print("Building facility-level ED summary (capacity band vs. observed demand)...")
    facility_df = _build_facility_summary(conn)
    _write_table(conn, "analytics", "utilization_ed_facility_summary", facility_df)

    print("Building county-level ED trend summary (2008-2024, 4 breakdowns)...")
    county_df = _build_county_trends(conn)
    _write_table(conn, "analytics", "utilization_ed_county_trends", county_df)

    print("Building tract-level access-vs-utilization comparison "
          "(E2SFCA drive access vs. modeled ED rate per 1,000 residents)...")
    access_df = _build_access_vs_utilization(conn, tract_df)
    _write_table(conn, "analytics", "utilization_access_vs_utilization", access_df)

    print("Running criterion-validity diagnostics (RISK-015 closure): "
          "modeled tract ED rate vs. each scenario's own priority score...")
    validity_df = _build_criterion_validity(conn, access_df)
    _write_table(conn, "analytics", "utilization_criterion_validity", validity_df)

    now = datetime.now(UTC).isoformat()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS meta.builds (
            build_id VARCHAR PRIMARY KEY, started_at VARCHAR NOT NULL,
            finished_at VARCHAR, phase VARCHAR NOT NULL, notes VARCHAR
        )
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta.builds (build_id, started_at, finished_at, phase, notes) "
        "VALUES (?, ?, ?, ?, ?)",
        [
            f"phase7-utilization-{now}",
            now,
            now,
            "phase_7_utilization",
            f"zip_observed={zip_df.height} rows, tract_modeled={tract_df.height} rows, "
            f"unmatched_zips={diag['n_unmatched_zips']}",
        ],
    )

    conn.close()
    print("\nUtilization pipeline complete.")
    return 0


def _build_zip_observed(conn: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    """Real observed ED-related encounters, by patient ZIP, for Santa
    Clara County residents (patient_county_name = SANTA CLARA) -- this
    answers 'how much ED care do county residents use,' regardless of
    which facility (in or out of county) they used. A separate question
    -- 'how much ED demand do Santa Clara facilities see' -- would filter
    on facility_county_name instead; this pipeline uses the resident
    framing because it is the one a tract-level, resident-population
    rate can be meaningfully computed against."""
    rows = conn.execute(
        """
        SELECT patient_zip, pattype, SUM(discharges) AS encounters
        FROM utilization.hcai_patient_origin
        WHERE patient_county_name = 'SANTA CLARA'
          AND pattype IN ('ED Only', 'Inpatient from ED')
        GROUP BY patient_zip, pattype
        """
    ).fetchall()
    out_rows: list[dict[str, Any]] = []
    for patient_zip, pattype, encounters in rows:
        out_rows.append(
            {
                "patient_zip": patient_zip,
                "pattype_group": _ED_PATTYPE_TO_GROUP[pattype],
                "encounters": int(encounters),
                "reporting_year": 2024,
                "geography_level": "patient_zip",
                "data_status": "observed",
            }
        )
    return _rows_to_df(out_rows)


def _build_tract_modeled(
    conn: duckdb.DuckDBPyConnection, zip_df: pl.DataFrame
) -> tuple[pl.DataFrame, dict[str, Any]]:
    zip_encounters = [
        ZipObservedEncounters(r["patient_zip"], r["pattype_group"], r["encounters"])
        for r in zip_df.iter_rows(named=True)
    ]
    crosswalk_rows = conn.execute(
        "SELECT zcta_geoid, tract_geoid_2020, weight, allocation_quality "
        "FROM geo.crosswalk_zip_tract"
    ).fetchall()
    crosswalk = [CrosswalkRow(z, t, float(w), q) for z, t, w, q in crosswalk_rows]

    results, diagnostics = allocate_zip_encounters_to_tracts(zip_encounters, crosswalk)

    out_rows = [
        {
            "tract_geoid_2020": r.tract_geoid_2020,
            "pattype_group": r.pattype_group,
            "modeled_encounters": r.modeled_encounters,
            "n_contributing_zips": r.n_contributing_zips,
            "crosswalk_quality": r.lowest_crosswalk_quality,
            "method": r.method,
            "reporting_year": 2024,
            "geography_level": "tract",
            "data_status": "modeled",
        }
        for r in results
    ]
    diag = {
        "total_observed_encounters": diagnostics.total_observed_encounters,
        "total_modeled_encounters": diagnostics.total_modeled_encounters,
        "n_zips_observed": diagnostics.n_zips_observed,
        "n_zips_matched": diagnostics.n_zips_matched,
        "n_unmatched_zips": diagnostics.n_unmatched_zips,
        "unmatched_zip_encounters": diagnostics.unmatched_zip_encounters,
        "unmatched_zip_codes": diagnostics.unmatched_zip_codes,
    }
    return _rows_to_df(out_rows), diag


def diag_total_observed(diag: dict[str, Any]) -> int:
    return int(diag["total_observed_encounters"])


def diag_total_modeled(diag: dict[str, Any]) -> float:
    return float(diag["total_modeled_encounters"])


# Every disposition/payer/sex column in hcai_ed_facility_profile is an
# independent, mutually-exclusive-and-exhaustive breakdown of the exact
# same total ED encounter population, so any one of them that sums
# without hitting a masked (NULL) cell gives the true total. COALESCE
# across breakdowns (not a single hard-coded one) means one facility's
# masked disposition cell doesn't block computing its total when its
# payer or sex breakdown happens to be fully unmasked -- verified live
# against all 9 Santa Clara facilities (2026-07-13): each resolves via
# sex or payer sum even where disposition sum is NULL.
_TOTAL_ED_ENCOUNTERS_SQL = """
COALESCE(
    (Sex_Female + Sex_Male + Sex_Other_Unknown),
    (Payer_All_Other_Payers + Payer_MediCal + Payer_Medicare + Payer_Other_Government
     + Payer_Other_Unknown + Payer_Private_Health_Insurance + Payer_Self_Pay_or_Uninsured),
    (disp_Acute_Care + disp_Against_Medical_Advice + disp_Childrens_or_Cancer + disp_Died
     + disp_Home_Health_Service + disp_Invalid_Blank + disp_Not_Defined_Elsewhere
     + disp_Prison_Jail + disp_Psychiatric_Care + disp_Routine + disp_SN_IC_Care
     + disp_Hospice_Care + disp_Residential_Care + disp_CAH + disp_Rehab + disp_Other
     + disp_Disaster_Care_Site)
)
"""


def _build_facility_summary(conn: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    rows = conn.execute(
        f"""
        SELECT
            oshpd_id, FACILITY_NAME, DBA_CITY,
            LPAD(CAST(DBA_ZIP_CODE AS VARCHAR), 5, '0') AS DBA_ZIP_CODE,
            LICENSE_CATEGORY_DESC, TRAUMA_CENTER_DESC, ER_SERVICE_LEVEL_DESC,
            RURAL_HOSPITAL_DESC, TEACHING_HOSPITAL_DESC, LICENSED_BED_SIZE,
            {_TOTAL_ED_ENCOUNTERS_SQL} AS total_ed_encounters,
            disp_Died, disp_Routine, disp_Psychiatric_Care,
            Payer_MediCal, Payer_Medicare, Payer_Private_Health_Insurance,
            Payer_Self_Pay_or_Uninsured, Payer_Other_Government, Payer_All_Other_Payers,
            Payer_Other_Unknown,
            English, Spanish, All_Other_Languages, PLS_Other_Unknown,
            reporting_year
        FROM utilization.hcai_ed_facility_profile
        """
    ).fetchall()
    columns = [d[0] for d in conn.description]
    out_rows = []
    for row in rows:
        record = dict(zip(columns, row, strict=True))
        record["geography_level"] = "facility"
        record["data_status"] = "observed"
        out_rows.append(record)
    return _rows_to_df(out_rows)


def _build_county_trends(conn: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    rows = conn.execute(
        """
        SELECT breakdown_category, category_value, service_year, encounters,
               is_suppressed, suppression_annotation_desc
        FROM utilization.hcai_ed_patient_county
        ORDER BY breakdown_category, category_value, service_year
        """
    ).fetchall()
    columns = [d[0] for d in conn.description]
    out_rows = []
    for row in rows:
        record = dict(zip(columns, row, strict=True))
        record["geography_level"] = "county"
        record["data_status"] = "suppressed" if record["is_suppressed"] else "observed"
        out_rows.append(record)
    return _rows_to_df(out_rows)


def _build_access_vs_utilization(
    conn: duckdb.DuckDBPyConnection, tract_modeled_df: pl.DataFrame
) -> pl.DataFrame:
    population_rows = conn.execute(
        "SELECT DISTINCT tract_geoid_2020, total_population FROM health.places_observations"
    ).fetchall()
    population_by_tract = {t: float(p) for t, p in population_rows if p is not None}

    access_rows = conn.execute(
        """
        SELECT tract_geoid_2020, AVG(accessibility_score) AS accessibility_score
        FROM analytics.e2sfca_accessibility
        WHERE category = ? AND mode = ?
        GROUP BY tract_geoid_2020
        """,
        [_ACCESS_COMPARISON_CATEGORY, _ACCESS_COMPARISON_MODE],
    ).fetchall()
    access_by_tract = {t: float(s) for t, s in access_rows}

    # Two ED groups (ed_only, inpatient_from_ed) modeled independently --
    # combine here into one "any ED encounter" figure per tract for the
    # rate calculation, clearly labeled as a sum of the two modeled
    # groups, not a third independently-modeled quantity.
    combined_by_tract: dict[str, float] = {}
    contributing_zips_by_tract: dict[str, int] = {}
    quality_by_tract: dict[str, str] = {}
    for r in tract_modeled_df.iter_rows(named=True):
        t = r["tract_geoid_2020"]
        combined_by_tract[t] = combined_by_tract.get(t, 0.0) + r["modeled_encounters"]
        contributing_zips_by_tract[t] = max(
            contributing_zips_by_tract.get(t, 0), r["n_contributing_zips"]
        )
        quality_by_tract[t] = r["crosswalk_quality"]

    all_tracts = sorted(set(combined_by_tract) | set(access_by_tract) | set(population_by_tract))
    out_rows = []
    for t in all_tracts:
        modeled_encounters = combined_by_tract.get(t)
        population = population_by_tract.get(t)
        rate_per_1000 = (
            (modeled_encounters / population) * 1000.0
            if modeled_encounters is not None and population and population > 0
            else None
        )
        is_low_reliability = (
            rate_per_1000 is not None and rate_per_1000 > IMPLAUSIBLE_RATE_CEILING_PER_1000
        )
        out_rows.append(
            {
                "tract_geoid_2020": t,
                "modeled_ed_encounters_combined": modeled_encounters,
                "total_population": population,
                "modeled_ed_rate_per_1000": rate_per_1000,
                "e2sfca_hospital_drive_access_score": access_by_tract.get(t),
                "n_contributing_zips": contributing_zips_by_tract.get(t),
                "crosswalk_quality": quality_by_tract.get(t),
                "data_status": "modeled",
                "method": "zip_to_tract_area_weighted_allocation;rate_per_1000_population",
                "rate_reliability": "low_reliability" if is_low_reliability else "plausible_range",
                "rate_reliability_note": _LOW_RELIABILITY_NOTE if is_low_reliability else None,
            }
        )
    return _rows_to_df(out_rows)


def _build_criterion_validity(
    conn: duckdb.DuckDBPyConnection, access_df: pl.DataFrame
) -> pl.DataFrame:
    outcome_values = {
        r["tract_geoid_2020"]: r["modeled_ed_rate_per_1000"]
        for r in access_df.iter_rows(named=True)
        if r["modeled_ed_rate_per_1000"] is not None
    }
    scenarios = load_scenarios(SCENARIOS_CONFIG_PATH)
    metric_definitions = load_metric_registry(METRICS_CONFIG_PATH)

    out_rows = []
    for scenario in scenarios:
        score_rows = conn.execute(
            "SELECT tract_geoid_2020, score FROM analytics.scenario_scores "
            "WHERE scenario_id = ? AND score IS NOT NULL",
            [scenario.scenario_id],
        ).fetchall()
        tract_scores = {t: float(s) for t, s in score_rows}

        result = run_correlation_diagnostic(
            scenario,
            metric_definitions=metric_definitions,
            hypothesis=(
                f"Tracts with a higher '{scenario.label}' priority score also tend to have a "
                "higher modeled emergency-department visit rate per 1,000 residents "
                "(criterion validity against an independent utilization outcome, not causal)."
            ),
            tract_scores=tract_scores,
            outcome_values=outcome_values,
            outcome_label="Modeled ED visit rate per 1,000 residents (HCAI patient-origin, "
            "ZIP-to-tract allocated)",
            outcome_source_table="analytics.utilization_access_vs_utilization",
            outcome_source_field="modeled_ed_rate_per_1000",
            validity_type="criterion",
        )
        out_rows.append(
            {
                "scenario_id": result.scenario_id,
                "outcome_label": result.outcome_label,
                "validity_type": result.validity_type,
                "hypothesis": result.hypothesis,
                "is_tautological": result.is_tautological,
                "tautology_reason": result.tautology_reason,
                "n_paired_observations": result.n_paired_observations,
                "n_missing": result.n_missing,
                "spearman_r": result.spearman_r,
                "spearman_p_value": result.spearman_p_value,
                "pearson_r": result.pearson_r,
                "pearson_p_value": result.pearson_p_value,
                "bootstrap_ci_lower": result.bootstrap_ci_lower,
                "bootstrap_ci_upper": result.bootstrap_ci_upper,
                "n_bootstrap": result.n_bootstrap,
                "interpretation_note": result.interpretation_note,
            }
        )
        print(
            f"  {scenario.scenario_id}: spearman_r={result.spearman_r}, "
            f"n={result.n_paired_observations}, tautological={result.is_tautological}"
        )
    return _rows_to_df(out_rows)


def _rows_to_df(rows: list[dict[str, Any]]) -> pl.DataFrame:
    if not rows:
        return pl.DataFrame(rows)
    return pl.DataFrame(rows, infer_schema_length=None)


def _write_table(
    conn: duckdb.DuckDBPyConnection, schema: str, table: str, df: pl.DataFrame
) -> None:
    conn.execute(f"DROP TABLE IF EXISTS {schema}.{table}")
    conn.register("_tmp_df", df)
    conn.execute(f"CREATE TABLE {schema}.{table} AS SELECT * FROM _tmp_df")
    conn.unregister("_tmp_df")
    count = conn.execute(f"SELECT COUNT(*) FROM {schema}.{table}").fetchone()
    print(f"  loaded {schema}.{table}: {count[0] if count else 0} rows")


if __name__ == "__main__":
    raise SystemExit(main())
