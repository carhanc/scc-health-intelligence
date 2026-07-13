"""Transparent, explainable name/address normalization and similarity for
resource deduplication (Phase 6). Deliberately simple token-set matching,
not a black-box fuzzy-matching library -- every match this pipeline makes
must be explainable in the duplicate-review table docs/data records
require.
"""

from __future__ import annotations

import re

_PUNCTUATION_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")

# Common street-suffix abbreviations normalized so "123 Main St" and
# "123 Main Street" compare equal -- deliberately small and reversible,
# not an aggressive stemmer.
_ADDRESS_ABBREVIATIONS = {
    "street": "st",
    "avenue": "ave",
    "boulevard": "blvd",
    "drive": "dr",
    "road": "rd",
    "lane": "ln",
    "court": "ct",
    "place": "pl",
    "circle": "cir",
    "parkway": "pkwy",
    "highway": "hwy",
    "suite": "ste",
}


def normalize_name(raw: str | None) -> str:
    """Lowercase, strip punctuation, collapse whitespace. Deliberately
    does NOT strip category words like "clinic" or "health center" --
    doing so risks merging two genuinely different organizations that
    happen to share a generic descriptor."""
    if not raw:
        return ""
    text = raw.lower()
    text = _PUNCTUATION_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def normalize_address(raw: str | None) -> str:
    if not raw:
        return ""
    text = raw.lower()
    text = _PUNCTUATION_RE.sub(" ", text)
    words = _WHITESPACE_RE.sub(" ", text).strip().split(" ")
    words = [_ADDRESS_ABBREVIATIONS.get(w, w) for w in words]
    return " ".join(words)


def name_similarity(a: str, b: str) -> float:
    """Jaccard similarity over word tokens of two already-normalized
    names. 0.0 if either is empty. 1.0 for an exact token-set match."""
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)
