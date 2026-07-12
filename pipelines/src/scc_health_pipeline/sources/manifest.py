"""Read/write DATA_MANIFEST.json -- the machine-readable provenance ledger.

Schema per docs/02_DATA_SOURCE_REGISTRY.md §11. One entry per acquired raw
artifact. Entries are appended/updated by source_id + resource_id; existing
entries for other sources are always preserved (never truncate the whole
file when updating one source).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scc_health_pipeline.sources.base import RawArtifact

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.json"


def load_manifest(path: Path = DEFAULT_MANIFEST_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON array of manifest entries.")
    return data


def save_manifest(entries: list[dict[str, Any]], path: Path = DEFAULT_MANIFEST_PATH) -> None:
    entries_sorted = sorted(
        entries, key=lambda e: (e.get("source_id", ""), e.get("resource_id", ""))
    )
    with path.open("w", encoding="utf-8") as fh:
        json.dump(entries_sorted, fh, indent=2)
        fh.write("\n")


def record_artifact(
    artifact: RawArtifact,
    *,
    publisher: str,
    landing_page: str,
    source_vintage: str,
    release_date: str | None,
    native_geography: str,
    license_or_terms: str,
    adapter_version: str,
    notes: str = "",
    path: Path = DEFAULT_MANIFEST_PATH,
) -> None:
    """Insert or update this artifact's manifest entry in place."""
    entries = load_manifest(path)
    entries = [
        e
        for e in entries
        if not (
            e.get("source_id") == artifact.source_id
            and e.get("resource_id") == artifact.resource_id
        )
    ]
    entries.append(
        {
            "source_id": artifact.source_id,
            "resource_id": artifact.resource_id,
            "publisher": publisher,
            "landing_page": landing_page,
            "resource_url": artifact.url,
            "retrieved_at": artifact.retrieved_at,
            "source_vintage": source_vintage,
            "release_date": release_date,
            "sha256": artifact.sha256,
            "bytes": artifact.bytes,
            "native_geography": native_geography,
            "license_or_terms": license_or_terms,
            "adapter_version": adapter_version,
            "status": artifact.status,
            "notes": notes or artifact.notes,
        }
    )
    save_manifest(entries, path)
