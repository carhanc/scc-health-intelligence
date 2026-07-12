"""Hand-calculated fixture tests for pipelines/.../metrics/transforms.py."""

from __future__ import annotations

from scc_health_pipeline.metrics.transforms import (
    acs_ratio,
    acs_sum_ratio,
    county_relative_percentile,
    flip_direction,
    winsorize,
)


def test_flip_direction_concern_high_passes_through() -> None:
    assert flip_direction(12.5, "concern_high") == 12.5


def test_flip_direction_concern_low_is_negated() -> None:
    assert flip_direction(70.0, "concern_low") == -70.0


def test_flip_direction_neutral_passes_through() -> None:
    assert flip_direction(5.0, "neutral") == 5.0


def test_flip_direction_none_stays_none() -> None:
    assert flip_direction(None, "concern_high") is None


def test_county_relative_percentile_hand_calculated_no_ties() -> None:
    # 5 values: 10, 20, 30, 40, 50 -> ranks 0,1,2,3,4 -> percentiles 0,25,50,75,100
    values = [30.0, 10.0, 50.0, 20.0, 40.0]
    result = county_relative_percentile(values)
    assert result == [50.0, 0.0, 100.0, 25.0, 75.0]


def test_county_relative_percentile_average_rank_for_ties() -> None:
    # values: 10, 20, 20, 30 -> ranks 0, (1+2)/2=1.5, 1.5, 3 -> pct = rank/(4-1)*100
    values = [10.0, 20.0, 20.0, 30.0]
    result = county_relative_percentile(values)
    assert result[0] == 0.0
    assert result[1] == 50.0
    assert result[2] == 50.0
    assert result[3] == 100.0


def test_county_relative_percentile_excludes_none_from_comparison_group() -> None:
    values = [10.0, None, 20.0, 30.0]
    result = county_relative_percentile(values)
    # None stays None; the 3 present values are ranked among themselves only.
    assert result[1] is None
    assert result[0] == 0.0
    assert result[2] == 50.0
    assert result[3] == 100.0


def test_county_relative_percentile_all_none_returns_all_none() -> None:
    assert county_relative_percentile([None, None]) == [None, None]


def test_winsorize_clips_outliers_and_counts_them() -> None:
    # 100 values 1..100; 1st/99th percentile (linear interpolation) clip
    # the extreme low/high values.
    values = [float(i) for i in range(1, 101)]
    result = winsorize(values, lower_pct=1.0, upper_pct=99.0)
    assert result.lower_bound is not None
    assert result.upper_bound is not None
    assert result.n_clipped_low > 0
    assert result.n_clipped_high > 0
    assert min(v for v in result.winsorized_values if v is not None) == result.lower_bound
    assert max(v for v in result.winsorized_values if v is not None) == result.upper_bound


def test_winsorize_preserves_none_values() -> None:
    result = winsorize([1.0, None, 100.0], lower_pct=0.0, upper_pct=100.0)
    assert result.winsorized_values[1] is None


def test_acs_ratio_hand_calculated() -> None:
    assert acs_ratio(250.0, 1000.0) == 25.0


def test_acs_ratio_none_on_missing_input() -> None:
    assert acs_ratio(None, 1000.0) is None
    assert acs_ratio(250.0, None) is None


def test_acs_ratio_none_on_zero_denominator() -> None:
    assert acs_ratio(10.0, 0.0) is None


def test_acs_sum_ratio_hand_calculated() -> None:
    # 3 lines summing to 150, denominator 1000 -> 15%
    assert acs_sum_ratio([50.0, 60.0, 40.0], 1000.0) == 15.0


def test_acs_sum_ratio_none_if_any_line_missing() -> None:
    assert acs_sum_ratio([50.0, None, 40.0], 1000.0) is None
