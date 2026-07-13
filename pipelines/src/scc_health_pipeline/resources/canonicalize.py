"""Canonical resource inventory and deduplication (Phase 6 Access Lab),
per docs/03_ANALYTICS_METHODS.md §12.1 and this phase's own spec:
official identifiers first, then normalized name+address, then a
cautious spatial+name fallback -- geographic proximity alone never
merges two records.

Only the "clinical care" category has meaningful cross-source overlap
(HCAI licensed facilities, HRSA health center sites, and the SCC Public
Health clinics layer can all describe the same real-world FQHC). Food
retailers (SNAP, single source) and transit hubs (VTA GTFS, single
source) pass through the same pipeline for schema consistency but
trivially produce one canonical record per input record.

Known limitation (see RISK-023): group formation is anchor-based, not
fully pairwise. If record A matches both B and C against the tier-1/
tier-2 rules, B and C join A's group even though B and C were never
directly compared to each other. On real Santa Clara data this produced
plausible results (FQHC grantees such as Gardner Health Network commonly
co-enroll several HRSA site records -- medical, dental, behavioral
health -- at the same street address, 3-40 meters apart in the
underlying geocoding), but it is a theoretical over-merge risk if two
dissimilar sites both independently pass the fallback threshold against
the same anchor. Every merge decision is logged in
resources.facility_duplicate_review with its distance and name
similarity for audit; none are silent.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from scc_health_pipeline.resources.name_match import (
    name_similarity,
    normalize_address,
    normalize_name,
)
from scc_health_pipeline.routing.straight_line import haversine_miles

# A canonical facility never merges two records on proximity alone --
# both a distance AND a name-similarity bar must be cleared.
_SPATIAL_FALLBACK_DISTANCE_MILES = 0.1  # ~530 feet
_SPATIAL_FALLBACK_NAME_SIMILARITY = 0.34  # at least ~1 of 3 tokens shared

_LAT_MIN, _LAT_MAX = 36.7, 37.7
_LON_MIN, _LON_MAX = -122.3, -121.0


@dataclass(frozen=True)
class RawResourceRecord:
    source_id: str
    source_specific_id: str
    name: str
    category: str
    subtype: str
    status: str
    address: str
    city: str
    zip_code: str
    latitude: float | None
    longitude: float | None
    is_official: bool
    source_publisher: str
    source_dataset: str
    source_url: str
    retrieved_at: str
    source_vintage: str
    license_or_terms: str


@dataclass
class CanonicalFacility:
    canonical_resource_id: str
    category: str
    subtype: str
    name: str
    normalized_name: str
    status: str
    address: str
    city: str
    zip_code: str
    latitude: float | None
    longitude: float | None
    is_official: bool
    dedup_status: str
    coordinate_quality: str
    n_contributing_sources: int
    limitation_notes: str


@dataclass
class CrosswalkEntry:
    canonical_resource_id: str
    source_id: str
    source_specific_id: str
    match_method: str
    match_confidence: str


@dataclass
class DuplicateReviewEntry:
    record_a_source_id: str
    record_a_source_specific_id: str
    record_b_source_id: str
    record_b_source_specific_id: str
    distance_miles: float
    name_similarity: float
    decision: str  # "merged" | "flagged_not_merged"
    reason: str


@dataclass
class RejectedRecord:
    source_id: str
    source_specific_id: str
    reason: str


@dataclass
class DedupResult:
    canonical_facilities: list[CanonicalFacility] = field(default_factory=list)
    crosswalk: list[CrosswalkEntry] = field(default_factory=list)
    duplicate_review: list[DuplicateReviewEntry] = field(default_factory=list)
    rejected: list[RejectedRecord] = field(default_factory=list)


def _coordinate_quality(lat: float | None, lon: float | None) -> str:
    if lat is None or lon is None:
        return "missing"
    if not (_LAT_MIN <= lat <= _LAT_MAX) or not (_LON_MIN <= lon <= _LON_MAX):
        return "out_of_bounds"
    return "valid"


def _canonical_id(category: str, seed_source_id: str, seed_specific_id: str) -> str:
    digest = hashlib.sha256(f"{category}|{seed_source_id}|{seed_specific_id}".encode()).hexdigest()
    return f"fac_{category}_{digest[:12]}"


def deduplicate_records(records: list[RawResourceRecord]) -> DedupResult:
    """Groups `records` into canonical facilities. Records missing a name
    or with no usable coordinates are rejected outright (never silently
    dropped -- they land in `rejected`, not just absent from the output).
    """
    result = DedupResult()

    usable: list[RawResourceRecord] = []
    for r in records:
        if not r.name or not r.name.strip():
            result.rejected.append(
                RejectedRecord(r.source_id, r.source_specific_id, "missing name")
            )
            continue
        usable.append(r)

    # Deterministic order: dedup outcomes must not depend on input order.
    usable.sort(key=lambda r: (r.source_id, r.source_specific_id))

    assigned: set[int] = set()
    groups: list[list[int]] = []

    for i, a in enumerate(usable):
        if i in assigned:
            continue
        group = [i]
        assigned.add(i)
        norm_a_name = normalize_name(a.name)
        norm_a_addr = normalize_address(a.address)
        for j in range(i + 1, len(usable)):
            if j in assigned:
                continue
            b = usable[j]
            if a.source_id == b.source_id:
                continue  # dedup is cross-source; two rows from the same
                # source are two real records, not a match candidate.
            norm_b_name = normalize_name(b.name)
            norm_b_addr = normalize_address(b.address)

            # Tier 1: normalized name + normalized address exact match.
            if norm_a_name and norm_a_name == norm_b_name and norm_a_addr == norm_b_addr:
                group.append(j)
                assigned.add(j)
                result.duplicate_review.append(
                    DuplicateReviewEntry(
                        a.source_id, a.source_specific_id, b.source_id, b.source_specific_id,
                        distance_miles=0.0,
                        name_similarity=1.0,
                        decision="merged",
                        reason="exact normalized name + address match",
                    )
                )
                continue

            # Tier 2 (fallback): spatial proximity AND name similarity --
            # proximity alone never merges (spec requirement).
            if (
                a.latitude is not None
                and a.longitude is not None
                and b.latitude is not None
                and b.longitude is not None
            ):
                dist = haversine_miles(a.latitude, a.longitude, b.latitude, b.longitude)
                sim = name_similarity(norm_a_name, norm_b_name)
                clears_distance = dist <= _SPATIAL_FALLBACK_DISTANCE_MILES
                clears_name = sim >= _SPATIAL_FALLBACK_NAME_SIMILARITY
                if clears_distance and clears_name:
                    group.append(j)
                    assigned.add(j)
                    result.duplicate_review.append(
                        DuplicateReviewEntry(
                            a.source_id, a.source_specific_id, b.source_id, b.source_specific_id,
                            distance_miles=dist,
                            name_similarity=sim,
                            decision="merged",
                            reason=(
                                f"spatial+name fallback: {dist:.3f} mi apart, "
                                f"{sim:.2f} name similarity"
                            ),
                        )
                    )
                elif dist <= _SPATIAL_FALLBACK_DISTANCE_MILES:
                    # Close but names don't clear the bar -- disclosed for
                    # human review, never silently auto-merged.
                    result.duplicate_review.append(
                        DuplicateReviewEntry(
                            a.source_id, a.source_specific_id, b.source_id, b.source_specific_id,
                            distance_miles=dist,
                            name_similarity=sim,
                            decision="flagged_not_merged",
                            reason=(
                                f"within {_SPATIAL_FALLBACK_DISTANCE_MILES} mi but name "
                                f"similarity {sim:.2f} is below the merge threshold "
                                f"({_SPATIAL_FALLBACK_NAME_SIMILARITY}) -- proximity alone "
                                "never merges records."
                            ),
                        )
                    )
        groups.append(group)

    for group_indices in groups:
        members = [usable[i] for i in group_indices]
        # Prefer an official source as the seed for the canonical name/
        # address/coordinates when the group spans official + supplemental.
        seed = next((m for m in members if m.is_official), members[0])
        canonical_id = _canonical_id(seed.category, seed.source_id, seed.source_specific_id)

        coord_quality = _coordinate_quality(seed.latitude, seed.longitude)
        dedup_status = (
            "single_source" if len(members) == 1 else "matched_multi_source"
        )
        limitation_notes = ""
        if len(members) > 1:
            sources = ", ".join(sorted({m.source_id for m in members}))
            limitation_notes = f"Matched across sources: {sources}."

        result.canonical_facilities.append(
            CanonicalFacility(
                canonical_resource_id=canonical_id,
                category=seed.category,
                subtype=seed.subtype,
                name=seed.name,
                normalized_name=normalize_name(seed.name),
                status=seed.status,
                address=seed.address,
                city=seed.city,
                zip_code=seed.zip_code,
                latitude=seed.latitude,
                longitude=seed.longitude,
                is_official=any(m.is_official for m in members),
                dedup_status=dedup_status,
                coordinate_quality=coord_quality,
                n_contributing_sources=len({m.source_id for m in members}),
                limitation_notes=limitation_notes,
            )
        )
        for m in members:
            result.crosswalk.append(
                CrosswalkEntry(
                    canonical_resource_id=canonical_id,
                    source_id=m.source_id,
                    source_specific_id=m.source_specific_id,
                    match_method="seed" if m is seed else "matched",
                    match_confidence="high" if len(members) == 1 else "medium",
                )
            )

    return result
