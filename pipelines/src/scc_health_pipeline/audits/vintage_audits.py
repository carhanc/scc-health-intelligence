"""Source freshness / data-vintage-transparency audit.

Per CLAUDE.md's data-vintage-transparency requirement, publication date,
observation period, retrieval timestamp, geography vintage, and cadence
must never be collapsed into a single undifferentiated "current" label.
This audit classifies every source in DATA_MANIFEST.json into one of:

- "unavailable"       -- status is explicitly unavailable (e.g. blocked HPI)
- "draft"             -- the manifest notes flag a draft/non-final release
- "intentional_older" -- a historical/one-time-vintage source (e.g. an
                          annual survey release) that is not expected to
                          refresh on a tight cadence; being "old" by
                          calendar-day count is expected, not a defect
- "newest_verified"   -- retrieved within its own declared cadence window
- "lagged"            -- retrieved 1-2x its cadence window ago; not yet
                          alarming but should be refreshed soon
- "stale"             -- retrieved more than 2x its cadence window ago
                          with no visible unavailable state -- this is the
                          state this audit exists to catch

Every entry must also positively distinguish source_vintage (the
observation-period / release-vintage label, e.g. "SVI 2022" or "BRFSS
2022-2023") from retrieved_at (when *we* fetched it) -- collapsing the two
into one date is exactly the anti-pattern this audit guards against.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from scc_health_pipeline.audits.geography_audits import AuditReport
from scc_health_pipeline.sources.manifest import load_manifest

REPO_ROOT = Path(__file__).resolve().parents[3]

# Declared cadence (days) per source_id -- how often the *publisher*
# refreshes this dataset, used as the staleness-window unit. Sources
# absent from this table are historical/one-time releases and are
# evaluated as "intentional_older" rather than against a cadence window.
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

# Sources with a genuinely fixed, non-refreshing vintage (an annual/5-year
# survey release, a finalized statewide screening tool, a historical bulk
# file) -- "old" here reflects the publisher's own release cycle, not
# pipeline staleness.
_INTENTIONALLY_FIXED_VINTAGE: set[str] = {
    "cdc_atsdr_svi_2022",
    "calenviroscreen_5_0",
    "usda_snap_retailers",
    "acs_5year_geo_crosswalk",
    "hcai_ed_facility_profile",
    "hcai_patient_origin_market_share",
}


@dataclass
class VintageClassification:
    source_id: str
    state: str
    source_vintage: str | None
    release_date: str | None
    retrieved_at: str | None
    age_days: float | None
    reason: str


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


def classify_entry(entry: dict[str, Any], now: datetime | None = None) -> VintageClassification:
    now = now or datetime.now(UTC)
    source_id = entry.get("source_id", "<unknown>")
    status = entry.get("status")
    notes = (entry.get("notes") or "").lower()
    source_vintage = entry.get("source_vintage")
    release_date = entry.get("release_date")
    retrieved_at_raw = entry.get("retrieved_at")

    if status == "unavailable":
        return VintageClassification(
            source_id,
            "unavailable",
            source_vintage,
            release_date,
            retrieved_at_raw,
            None,
            "Manifest status is 'unavailable' -- a documented blocked source, not a silent gap.",
        )
    if "draft" in notes:
        return VintageClassification(
            source_id,
            "draft",
            source_vintage,
            release_date,
            retrieved_at_raw,
            None,
            "Manifest notes flag this as a draft/non-final release.",
        )

    retrieved_at = _parse_iso(retrieved_at_raw)
    age_days = (now - retrieved_at).total_seconds() / 86400 if retrieved_at else None

    if source_id in _INTENTIONALLY_FIXED_VINTAGE:
        return VintageClassification(
            source_id,
            "intentional_older",
            source_vintage,
            release_date,
            retrieved_at_raw,
            age_days,
            "Fixed-vintage source (annual/5-year survey or finalized statewide release); "
            "calendar age reflects the publisher's own release cycle, not pipeline staleness.",
        )

    cadence = _CADENCE_DAYS.get(source_id)
    if cadence is None or age_days is None:
        return VintageClassification(
            source_id,
            "intentional_older",
            source_vintage,
            release_date,
            retrieved_at_raw,
            age_days,
            "No declared cadence registered for this source_id -- treated as fixed-vintage "
            "until a cadence is added to _CADENCE_DAYS.",
        )
    if age_days <= cadence:
        state, reason = "newest_verified", f"Retrieved {age_days:.1f}d ago (cadence {cadence}d)."
    elif age_days <= 2 * cadence:
        state, reason = (
            "lagged",
            f"Retrieved {age_days:.1f}d ago (cadence {cadence}d) -- refresh soon.",
        )
    else:
        state, reason = "stale", f"Retrieved {age_days:.1f}d ago (cadence {cadence}d) -- overdue."
    return VintageClassification(
        source_id, state, source_vintage, release_date, retrieved_at_raw, age_days, reason
    )


def run_vintage_audits() -> AuditReport:
    report = AuditReport()
    entries = load_manifest()
    if not entries:
        report.add(
            "manifest_has_entries", False, "DATA_MANIFEST.json is empty -- run `make data` first."
        )
        return report

    for entry in entries:
        classification = classify_entry(entry)
        source_id = classification.source_id

        # The vintage-transparency check itself: source_vintage (observation
        # period / release vintage) and retrieved_at (our fetch timestamp)
        # must both be present and must not be collapsed into one field.
        has_vintage = bool(classification.source_vintage)
        has_retrieval = bool(classification.retrieved_at) or classification.state == "unavailable"
        report.add(
            f"vintage_fields_distinguished_{source_id}",
            has_vintage and has_retrieval,
            f"source_vintage={classification.source_vintage!r}, "
            f"retrieved_at={classification.retrieved_at!r} "
            f"({'ok' if has_vintage and has_retrieval else 'MISSING one or both'}).",
        )

        # Staleness is informational (state=stale is a real, expected
        # outcome for some sources, not a hard failure of the audit run) --
        # surfaced so a human/CI dashboard can review it, not to fail the
        # gate outright.
        report.add(
            f"freshness_state_{source_id}",
            classification.state != "stale",
            f"[{classification.state}] {classification.reason}",
        )

    return report
