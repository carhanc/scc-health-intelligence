from __future__ import annotations

from scc_health_pipeline.resources.name_match import (
    name_similarity,
    normalize_address,
    normalize_name,
)


def test_normalize_name_lowercases_and_strips_punctuation() -> None:
    expected = "gardner family health network inc"
    assert normalize_name("Gardner Family Health Network, Inc.") == expected


def test_normalize_name_handles_none_and_empty() -> None:
    assert normalize_name(None) == ""
    assert normalize_name("") == ""


def test_normalize_address_expands_common_abbreviations_both_directions() -> None:
    assert normalize_address("2400 Moorpark Avenue") == normalize_address("2400 Moorpark Ave")


def test_name_similarity_exact_match_is_one() -> None:
    a = normalize_name("Alviso Health Center")
    b = normalize_name("Alviso Health Center")
    assert name_similarity(a, b) == 1.0


def test_name_similarity_partial_overlap() -> None:
    a = normalize_name("Gardner Family Health Network Alviso Clinic")
    b = normalize_name("Alviso Health Center")
    score = name_similarity(a, b)
    assert 0.0 < score < 1.0


def test_name_similarity_no_overlap_is_zero() -> None:
    a = normalize_name("Kaiser Permanente San Jose")
    b = normalize_name("Stanford Health Care")
    assert name_similarity(a, b) == 0.0


def test_name_similarity_empty_input_is_zero() -> None:
    assert name_similarity("", "something") == 0.0
    assert name_similarity("something", "") == 0.0
