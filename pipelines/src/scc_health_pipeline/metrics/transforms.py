"""Pure metric-preprocessing transforms: directionality, winsorization,
county-relative percentile, and ACS ratio/sum-ratio derivations.

Implements docs/03_ANALYTICS_METHODS.md §5 (Metric preprocessing) and
§2.3 step 4 (rate allocation via separate numerator/denominator). Every
function is pure (no I/O, no warehouse access) so it is directly
hand-fixture-testable -- see pipelines/tests/test_metric_transforms.py.

None (missing data) propagates through every function rather than being
treated as zero: a missing input always yields a missing output, never a
silently-substituted value (CLAUDE.md: "never silently backfill
unavailable data").
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Direction = Literal["concern_high", "concern_low", "neutral"]


def flip_direction(value: float | None, direction: Direction) -> float | None:
    """Align a raw metric value onto a "higher = more concern" scale.

    concern_high metrics (e.g. diabetes prevalence) pass through unchanged.
    concern_low / protective metrics (e.g. routine checkup rate) are
    negated, per docs/03 §5.1: `concern_value = -protective_value`.
    neutral metrics (contextual, not scored for concern) pass through
    unchanged; callers must not include neutral-direction metrics in a
    concern-percentile domain score.
    """
    if value is None:
        return None
    if direction == "concern_low":
        return -value
    return value


@dataclass(frozen=True)
class WinsorizeResult:
    winsorized_values: list[float | None]
    lower_bound: float | None
    upper_bound: float | None
    n_clipped_low: int
    n_clipped_high: int


def winsorize(
    values: list[float | None],
    lower_pct: float = 1.0,
    upper_pct: float = 99.0,
) -> WinsorizeResult:
    """Clip values to the [lower_pct, upper_pct] percentile range.

    Per docs/03 §5.2: "Use winsorization only when justified and
    configured... Never winsorize counts or rates merely to make a map
    look smoother." This function performs the clipping; callers decide
    whether a given metric's config enables it. None values are preserved
    as None (never clipped/imputed) and excluded from bound computation.
    """
    present = sorted(v for v in values if v is not None)
    if not present:
        return WinsorizeResult([None] * len(values), None, None, 0, 0)

    lower_bound = _percentile_of_sorted(present, lower_pct)
    upper_bound = _percentile_of_sorted(present, upper_pct)

    out: list[float | None] = []
    n_low = 0
    n_high = 0
    for v in values:
        if v is None:
            out.append(None)
        elif v < lower_bound:
            out.append(lower_bound)
            n_low += 1
        elif v > upper_bound:
            out.append(upper_bound)
            n_high += 1
        else:
            out.append(v)
    return WinsorizeResult(out, lower_bound, upper_bound, n_low, n_high)


def _percentile_of_sorted(sorted_values: list[float], pct: float) -> float:
    """Linear-interpolation percentile (numpy's default 'linear' method)."""
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100.0) * (len(sorted_values) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = rank - lo
    return sorted_values[lo] + frac * (sorted_values[hi] - sorted_values[lo])


def county_relative_percentile(values: list[float | None]) -> list[float | None]:
    """Empirical percentile (0-100) of each value among the non-null
    values in the list, using average ranks for ties (docs/03 §5.3).

    A None input yields a None output at that position; None values are
    excluded from the comparison group entirely (not ranked as 0 or
    imputed), so a tract missing this metric gets no percentile for it
    rather than an artificially low/high one.
    """
    present_indices = [i for i, v in enumerate(values) if v is not None]
    if not present_indices:
        return [None] * len(values)

    present_values: list[float] = [v for v in values if v is not None]
    order = sorted(range(len(present_values)), key=lambda i: present_values[i])

    # Average-rank tie handling: equal values receive the mean of the
    # ranks they would otherwise occupy.
    ranks = [0.0] * len(present_values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and present_values[order[j + 1]] == present_values[order[i]]:
            j += 1
        avg_rank = (i + j) / 2.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1

    n = len(present_values)
    percentiles = [(rank / (n - 1) * 100.0 if n > 1 else 50.0) for rank in ranks]

    out: list[float | None] = [None] * len(values)
    for local_i, global_i in enumerate(present_indices):
        out[global_i] = percentiles[local_i]
    return out


def acs_ratio(numerator: float | None, denominator: float | None) -> float | None:
    """A simple estimate ratio (e.g. poverty count / total population),
    expressed as a percentage. Per docs/03 §2.3 step 4: allocate/derive
    numerator and denominator separately, then recompute the rate --
    never divide two already-percentaged values."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    return (numerator / denominator) * 100.0


def acs_sum_ratio(numerators: list[float | None], denominator: float | None) -> float | None:
    """Sum several ACS table lines (e.g. every 'with a disability' line
    across age/sex breakdowns in table B18101) and divide by a total
    line, expressed as a percentage. If any contributing numerator line
    is missing, the sum is not computable and this returns None rather
    than silently treating the missing line as zero."""
    if denominator is None or denominator == 0:
        return None
    if any(n is None for n in numerators):
        return None
    total = sum(n for n in numerators if n is not None)
    return (total / denominator) * 100.0
