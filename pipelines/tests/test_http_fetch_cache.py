"""A reused (cached) raw file must keep the date it was actually downloaded."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

from scc_health_pipeline.sources.base import FetchContext, RemoteResource
from scc_health_pipeline.sources.http_fetch import fetch_with_retry


def test_cached_artifact_reports_original_retrieval_time_not_now(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    cached = raw_dir / "example.csv"
    cached.write_text("a,b\n1,2\n")
    downloaded_at = datetime(2026, 7, 11, 12, 0, tzinfo=UTC)
    os.utime(cached, (downloaded_at.timestamp(), downloaded_at.timestamp()))

    resource = RemoteResource(
        resource_id="example",
        url="https://example.invalid/example.csv",
        expected_content_type="text/csv",
        description="fixture",
    )
    artifact = fetch_with_retry(resource, FetchContext(raw_dir=raw_dir), source_id="example")

    assert artifact.status == "cached"
    assert artifact.retrieved_at.startswith("2026-07-11")
