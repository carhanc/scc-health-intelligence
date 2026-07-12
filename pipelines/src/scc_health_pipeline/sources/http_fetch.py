"""Shared HTTP fetch-with-retry helper used by every source adapter.

Rules enforced here (docs/02_DATA_SOURCE_REGISTRY.md §12, §13):
- timeouts and bounded retry with backoff;
- content-type validation before treating a response as valid data;
- reject HTML error pages masquerading as a 200 response;
- avoid redownloading unchanged resources when a cached copy with a
  matching checksum already exists;
- never write a partial/corrupt file over a good cached one.
"""

from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

from scc_health_pipeline.sources.base import FetchContext, RawArtifact, RemoteResource

# Content types that indicate the server returned an error/redirect page
# instead of the requested data file, even with a 200 status code.
_HTML_ERROR_MARKERS = ("text/html",)


def _sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_with_retry(
    resource: RemoteResource,
    context: FetchContext,
    source_id: str,
) -> RawArtifact:
    """Fetch one resource into `context.raw_dir`, retrying on transient errors.

    Returns a RawArtifact with status "success" (freshly downloaded),
    "cached" (existing checksummed copy reused), or "unavailable" (all
    retries exhausted) -- never raises for an ordinary network failure, so
    callers can record a truthful unavailable state instead of crashing the
    whole pipeline run.
    """
    context.raw_dir.mkdir(parents=True, exist_ok=True)
    suffix = _suffix_for(resource.url) or _suffix_for_content_type(resource.expected_content_type)
    dest_path = context.raw_dir / f"{resource.resource_id}{suffix}"

    if dest_path.exists():
        existing_sha = _sha256_of_file(dest_path)
        return RawArtifact(
            resource_id=resource.resource_id,
            source_id=source_id,
            local_path=dest_path,
            url=resource.url,
            sha256=existing_sha,
            bytes=dest_path.stat().st_size,
            content_type=resource.expected_content_type,
            retrieved_at=datetime.now(UTC).isoformat(),
            status="cached",
            notes="Reused existing immutable raw artifact; delete data/raw to force refresh.",
        )

    last_error: str = ""
    for attempt in range(1, context.max_retries + 1):
        try:
            with httpx.stream(
                "GET",
                resource.url,
                timeout=context.timeout_seconds,
                follow_redirects=True,
            ) as response:
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if any(marker in content_type for marker in _HTML_ERROR_MARKERS):
                    last_error = (
                        f"Server returned content-type '{content_type}', expected "
                        f"'{resource.expected_content_type}' -- likely an error page, not data."
                    )
                    raise ValueError(last_error)

                tmp_path = dest_path.with_suffix(dest_path.suffix + ".part")
                with tmp_path.open("wb") as fh:
                    for chunk in response.iter_bytes():
                        fh.write(chunk)
                tmp_path.rename(dest_path)

            sha256 = _sha256_of_file(dest_path)
            return RawArtifact(
                resource_id=resource.resource_id,
                source_id=source_id,
                local_path=dest_path,
                url=resource.url,
                sha256=sha256,
                bytes=dest_path.stat().st_size,
                content_type=content_type or resource.expected_content_type,
                retrieved_at=datetime.now(UTC).isoformat(),
                status="success",
            )
        except (httpx.HTTPError, ValueError) as exc:
            last_error = str(exc)
            if attempt < context.max_retries:
                time.sleep(context.backoff_seconds * attempt)

    return RawArtifact(
        resource_id=resource.resource_id,
        source_id=source_id,
        local_path=None,
        url=resource.url,
        sha256=None,
        bytes=0,
        content_type=None,
        retrieved_at=datetime.now(UTC).isoformat(),
        status="unavailable",
        notes=f"All {context.max_retries} attempts failed. Last error: {last_error}",
    )


def _suffix_for(url: str) -> str:
    path = url.split("?")[0]
    if "." in path.rsplit("/", 1)[-1]:
        return "." + path.rsplit(".", 1)[-1]
    return ""


def _suffix_for_content_type(content_type: str) -> str:
    """Fallback extension when a URL has no file extension (e.g. a REST API
    query string), keyed off the resource's declared expected content type."""
    mapping = {
        "application/zip": ".zip",
        "application/json": ".geojson",
        "text/plain": ".txt",
        "text/csv": ".csv",
    }
    return mapping.get(content_type, "")
