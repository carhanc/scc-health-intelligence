"""Shared Socrata Open Data API helper (used by CDC PLACES and any other
Socrata-hosted source).

Socrata dataset IDs rotate between annual releases (confirmed for CDC
PLACES during Phase 0 verification), so adapters should treat the pinned
ID as a "last verified" fallback, not a permanent constant, and re-verify
before each implementation session per docs/02_DATA_SOURCE_REGISTRY.md §4.1.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class SocrataDatasetMetadata:
    dataset_id: str
    name: str
    description: str
    rows_updated_at: str | None
    row_count: int | None


def fetch_dataset_metadata(
    domain: str, dataset_id: str, timeout: float = 30.0
) -> SocrataDatasetMetadata:
    """Fetch a Socrata dataset's metadata (for discovery/verification), e.g.
    confirming a dataset ID still resolves and checking its last-updated date
    before pinning it as the adapter's source."""
    url = f"https://{domain}/api/views/{dataset_id}.json"
    response = httpx.get(url, timeout=timeout)
    response.raise_for_status()
    data: dict[str, Any] = response.json()
    row_count = None
    for column in data.get("columns", []):
        if column.get("fieldName") == ":id":
            row_count = column.get("cachedContents", {}).get("non_null")
    return SocrataDatasetMetadata(
        dataset_id=dataset_id,
        name=data.get("name", ""),
        description=data.get("description", ""),
        rows_updated_at=str(data.get("rowsUpdatedAt")) if data.get("rowsUpdatedAt") else None,
        row_count=row_count,
    )


def download_dataset_csv(
    domain: str,
    dataset_id: str,
    dest_path: Path,
    *,
    where: str | None = None,
    limit: int | None = None,
    timeout: float = 120.0,
) -> Path:
    """Download a Socrata dataset (optionally filtered) as CSV via the
    resource export endpoint, streaming to disk."""
    url = f"https://{domain}/resource/{dataset_id}.csv"
    params: dict[str, str] = {}
    if where:
        params["$where"] = where
    if limit:
        params["$limit"] = str(limit)

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream(
        "GET", url, params=params, timeout=timeout, follow_redirects=True
    ) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if "text/html" in content_type:
            raise ValueError(
                f"Socrata endpoint {url} returned an HTML page instead of CSV -- "
                "the dataset ID is likely stale or retired."
            )
        tmp_path = dest_path.with_suffix(dest_path.suffix + ".part")
        with tmp_path.open("wb") as fh:
            for chunk in response.iter_bytes():
                fh.write(chunk)
        tmp_path.rename(dest_path)
    return dest_path
