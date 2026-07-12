"""Lightweight source freshness/vintage-transparency classifier for the API
layer.

Deliberately a small, self-contained reimplementation of the same
classification logic as
`pipelines/src/scc_health_pipeline/audits/vintage_audits.py`, rather than
an import of the `scc_health_pipeline` package: the API is a lightweight,
request-serving process and must not pull in that package's heavy
geopandas/polars/PySAL dependency chain just to do date arithmetic over
DATA_MANIFEST.json (see DECISIONS.md). Keep the two classification rule
sets in sync if either changes.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

FreshnessState = Literal[
    "unavailable", "draft", "intentional_older", "newest_verified", "lagged", "stale"
]

# Mirrors pipelines/.../vintage_audits.py's _CADENCE_DAYS -- keep in sync.
_CADENCE_DAYS: dict[str, int] = {
    "cdc_places_tract_2025": 365,
    "hcai_facility_attributes": 7,
    "hrsa_health_center_sites": 1,
    "hrsa_hpsa_primary_care": 1,
    "hrsa_hpsa_dental": 1,
    "hrsa_hpsa_mental_health": 1,
    "hrsa_mua_p": 1,
    "vta_gtfs": 90,
}

# Mirrors pipelines/.../vintage_audits.py's _INTENTIONALLY_FIXED_VINTAGE.
_INTENTIONALLY_FIXED_VINTAGE: set[str] = {
    "cdc_atsdr_svi_2022",
    "calenviroscreen_5_0",
    "usda_snap_retailers",
    "acs_5year_geo_crosswalk",
    "hcai_ed_facility_profile",
    "hcai_patient_origin_market_share",
}


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except ValueError:
        return None


def classify_freshness(entry: dict[str, Any], now: datetime | None = None) -> FreshnessState:
    now = now or datetime.now(UTC)
    source_id = entry.get("source_id", "")
    status = entry.get("status")
    notes = (entry.get("notes") or "").lower()

    if status == "unavailable":
        return "unavailable"
    if "draft" in notes:
        return "draft"

    if source_id in _INTENTIONALLY_FIXED_VINTAGE:
        return "intentional_older"

    cadence = _CADENCE_DAYS.get(source_id)
    retrieved_at = _parse_iso(entry.get("retrieved_at"))
    if cadence is None or retrieved_at is None:
        return "intentional_older"

    age: timedelta = now - retrieved_at
    age_days = age.total_seconds() / 86400
    if age_days <= cadence:
        return "newest_verified"
    if age_days <= 2 * cadence:
        return "lagged"
    return "stale"
