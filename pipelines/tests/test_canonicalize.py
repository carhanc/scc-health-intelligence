"""Unit tests for resource deduplication (Phase 6), including the explicit
spec requirement that geographic proximity alone must never merge two
records."""

from __future__ import annotations

from scc_health_pipeline.resources.canonicalize import (
    RawResourceRecord,
    deduplicate_records,
)


def _record(
    source_id: str,
    source_specific_id: str,
    name: str,
    address: str = "123 Main St",
    lat: float | None = 37.35,
    lon: float | None = -121.9,
    category: str = "clinic",
    is_official: bool = True,
) -> RawResourceRecord:
    return RawResourceRecord(
        source_id=source_id,
        source_specific_id=source_specific_id,
        name=name,
        category=category,
        subtype="community_clinic",
        status="Open",
        address=address,
        city="San Jose",
        zip_code="95128",
        latitude=lat,
        longitude=lon,
        is_official=is_official,
        source_publisher="Test Publisher",
        source_dataset="test_dataset",
        source_url="https://example.gov/data",
        retrieved_at="2026-07-12T00:00:00+00:00",
        source_vintage="test",
        license_or_terms="public domain",
    )


def test_exact_name_and_address_match_merges_across_sources() -> None:
    records = [
        _record("hcai", "H001", "Alviso Health Center", "1621 Gold St"),
        _record("hrsa", "R001", "Alviso Health Center", "1621 Gold St"),
    ]
    result = deduplicate_records(records)
    assert len(result.canonical_facilities) == 1
    fac = result.canonical_facilities[0]
    assert fac.dedup_status == "matched_multi_source"
    assert fac.n_contributing_sources == 2
    assert len(result.crosswalk) == 2
    assert result.duplicate_review[0].decision == "merged"
    assert result.duplicate_review[0].name_similarity == 1.0


def test_spatial_and_name_fallback_merges_close_similar_records() -> None:
    records = [
        _record(
            "hcai", "H002", "Gardner Family Health Network Alviso", lat=37.4248, lon=-121.9754
        ),
        _record(
            "scc_health_clinics", "S002", "Alviso Health Center Gardner", lat=37.4249, lon=-121.9755
        ),
    ]
    result = deduplicate_records(records)
    assert len(result.canonical_facilities) == 1
    assert result.canonical_facilities[0].dedup_status == "matched_multi_source"


def test_close_but_dissimilar_names_are_flagged_not_merged() -> None:
    """The explicit spec requirement: proximity alone never merges."""
    records = [
        _record("hcai", "H003", "Kaiser Permanente Pharmacy", lat=37.35, lon=-121.90),
        _record("hrsa", "R003", "County Dental Clinic", lat=37.3501, lon=-121.9001),
    ]
    result = deduplicate_records(records)
    assert len(result.canonical_facilities) == 2  # NOT merged
    assert result.duplicate_review[0].decision == "flagged_not_merged"
    assert "proximity alone never merges" in result.duplicate_review[0].reason


def test_records_from_the_same_source_never_merge_with_each_other() -> None:
    records = [
        _record("hcai", "H004", "Same Name Clinic", lat=37.35, lon=-121.90),
        _record("hcai", "H005", "Same Name Clinic", lat=37.35, lon=-121.90),
    ]
    result = deduplicate_records(records)
    # Two real, distinct HCAI-licensed facilities that happen to share a
    # name -- must remain two canonical records, not one.
    assert len(result.canonical_facilities) == 2


def test_missing_name_is_rejected_not_silently_dropped() -> None:
    records = [_record("hcai", "H006", "")]
    result = deduplicate_records(records)
    assert len(result.canonical_facilities) == 0
    assert len(result.rejected) == 1
    assert result.rejected[0].reason == "missing name"


def test_missing_coordinates_produce_a_flagged_coordinate_quality_not_a_crash() -> None:
    records = [_record("hcai", "H007", "No Coordinates Clinic", lat=None, lon=None)]
    result = deduplicate_records(records)
    assert len(result.canonical_facilities) == 1
    assert result.canonical_facilities[0].coordinate_quality == "missing"


def test_out_of_bounds_coordinates_are_flagged() -> None:
    records = [_record("hcai", "H008", "Somewhere Else Clinic", lat=40.0, lon=-100.0)]
    result = deduplicate_records(records)
    assert result.canonical_facilities[0].coordinate_quality == "out_of_bounds"


def test_canonical_ids_are_deterministic_across_runs() -> None:
    records = [_record("hcai", "H009", "Deterministic Test Clinic")]
    result_1 = deduplicate_records(records)
    result_2 = deduplicate_records(records)
    assert (
        result_1.canonical_facilities[0].canonical_resource_id
        == result_2.canonical_facilities[0].canonical_resource_id
    )


def test_official_source_is_preferred_as_the_canonical_seed_over_supplemental() -> None:
    records = [
        _record("osm_supplemental", "O001", "Some Clinic Alt Name", is_official=False),
        _record("hcai", "H010", "Some Clinic Official Name", is_official=True),
    ]
    result = deduplicate_records(records)
    fac = result.canonical_facilities[0]
    assert fac.is_official is True
