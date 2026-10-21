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


def test_error_page_triggers_a_retry_that_bypasses_a_cached_rejection(
    tmp_path: Path, monkeypatch
) -> None:
    """If a server's cache returns an HTML error page for an exact address, the
    next attempt adds a throwaway query parameter and gets the real file."""
    import contextlib

    from scc_health_pipeline.sources import http_fetch

    requested: list[str] = []

    class _Response:
        def __init__(self, url: str) -> None:
            self.headers = (
                {"content-type": "application/zip"}
                if "cache_bust=" in url
                else {"content-type": "text/html; charset=utf-8"}
            )

        def raise_for_status(self) -> None:
            return None

        def iter_bytes(self):
            yield b"PK-real-file"

    @contextlib.contextmanager
    def _fake_stream(method: str, url: str, **kwargs):
        requested.append(url)
        yield _Response(url)

    monkeypatch.setattr(http_fetch.httpx, "stream", _fake_stream)
    monkeypatch.setattr(http_fetch.time, "sleep", lambda _s: None)

    resource = RemoteResource(
        resource_id="tracts",
        url="https://example.invalid/tracts.zip",
        expected_content_type="application/zip",
        description="fixture",
    )
    artifact = fetch_with_retry(
        resource, FetchContext(raw_dir=tmp_path / "raw", max_retries=3), source_id="tracts"
    )

    assert artifact.status == "success"
    assert requested[0] == "https://example.invalid/tracts.zip"
    assert "cache_bust=" in requested[1]
    assert artifact.url == "https://example.invalid/tracts.zip"
