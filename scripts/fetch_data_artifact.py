#!/usr/bin/env python3
"""Download a published data artifact into place for a hosted deployment (Phase 9).

Run as the backend's *runtime start* step on Render, before uvicorn
starts (never during the build step -- Render's persistent disk is not
mounted yet at build time, see docs/deployment/production-deployment-guide.md
"Render persistent-disk timing"). Downloads `scc_health.duckdb` and its
manifest from a specific (or the newest `data-*`) GitHub Release,
verifying the warehouse's SHA-256 against the manifest before accepting
it -- a corrupted or truncated download must never silently become "the
production warehouse," and a known-good local warehouse is never
replaced until BOTH assets have downloaded and validated successfully.

Two authentication modes, chosen automatically:

- **`DATA_ARTIFACT_GITHUB_TOKEN` set** (required for this project's
  private repository): every request is authenticated, and release
  assets are downloaded through GitHub's authenticated asset-download
  API (`Accept: application/octet-stream`), which may respond with a
  302 redirect to a temporary, pre-signed cloud-storage URL -- the
  Authorization header is automatically stripped before following any
  redirect to a different host, so the GitHub token is never sent
  anywhere but api.github.com.
- **`DATA_ARTIFACT_GITHUB_TOKEN` unset**: falls back to fully
  unauthenticated requests using each asset's public
  `browser_download_url` -- works only for a genuinely public
  repository's public release assets.

`DATA_ARTIFACT_RELEASE_TAG` may be an exact tag (e.g.
"data-prod-20260714T221846Z", for a specific build or a rollback) or
the literal string "latest", which resolves to the newest published
(non-draft, non-prerelease) release whose tag starts with "data-".

Writes to the SAME paths the API itself reads (`Settings.
scc_health_warehouse_path`, `Settings.data_manifest_path`) -- on a
hosted deployment with a persistent disk mounted outside the repo
checkout (e.g. Render), set SCC_HEALTH_WAREHOUSE_PATH to a path on that
disk so the downloaded file survives across deploys; this script and
the API process agree on where it lives because both read it from the
same Settings object, not a second hardcoded path (DEC-067).

If the currently-installed warehouse's own SHA-256 already matches the
resolved release's manifest, the (large) warehouse download is skipped
entirely -- only the small manifest is re-fetched and rewritten.

Usage:
    DATA_ARTIFACT_RELEASE_TAG=latest \\
        DATA_ARTIFACT_GITHUB_TOKEN=ghp_... \\
        uv run python scripts/fetch_data_artifact.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api/src"))
from scc_health_api.settings import get_settings  # noqa: E402

_settings = get_settings()
WAREHOUSE_PATH = _settings.scc_health_warehouse_path
MANIFEST_PATH = _settings.data_manifest_path

# Set via an env var (not hardcoded) so this works for any fork without
# editing source -- defaults to the project's own repo.
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "carhanc/scc-health-intelligence")
GITHUB_API_BASE = "https://api.github.com"
_USER_AGENT = "scc-health-intelligence-fetch-artifact"

MANIFEST_ASSET_NAME = "DATA_MANIFEST.production.json"
WAREHOUSE_ASSET_NAME = "scc_health.duckdb"


class ArtifactFetchError(RuntimeError):
    """A fatal, actionable error. Messages here are printed to the user
    and MUST NEVER include a token value -- every message below is a
    fixed string plus non-secret context (a tag name, an asset name, an
    HTTP status code), never a header or env var value."""


class _AuthStrippingRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Follows redirects automatically (so callers just see a normal 200
    response) but strips the Authorization header whenever the redirect
    target's host differs from the original request's host. GitHub's
    authenticated release-asset endpoint responds with a 302 to a
    temporary, pre-signed cloud-storage URL (typically Amazon S3) --
    that URL must never receive our GitHub token, both because it
    doesn't need it and because sending an unexpected Authorization
    header to a pre-signed S3 URL can itself cause the request to be
    rejected."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802 -- overriding stdlib method name
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is None:
            return None
        if urlparse(req.full_url).netloc != urlparse(newurl).netloc:
            new_req.remove_header("Authorization")
        return new_req


_opener = urllib.request.build_opener(_AuthStrippingRedirectHandler)


def _open_url(url: str, headers: dict[str, str]):
    """The one function that ever touches the network. Tests monkeypatch
    this directly to simulate every response without any real HTTP call."""
    req = urllib.request.Request(url, headers=headers)
    return _opener.open(req)


def _raise_for_http_error(exc: urllib.error.HTTPError, context: str) -> None:
    if exc.code == 401:
        raise ArtifactFetchError(
            f"{context}: 401 Unauthorized -- DATA_ARTIFACT_GITHUB_TOKEN is invalid or expired."
        ) from exc
    if exc.code == 403:
        raise ArtifactFetchError(
            f"{context}: 403 Forbidden -- the token lacks 'Contents: Read' permission on this "
            "repository, or the GitHub API rate limit was hit."
        ) from exc
    if exc.code == 404:
        raise ArtifactFetchError(
            f"{context}: 404 Not Found -- if this is a private repository, "
            "DATA_ARTIFACT_GITHUB_TOKEN must be set with read access to it."
        ) from exc
    raise ArtifactFetchError(f"{context}: unexpected HTTP {exc.code}.") from exc


def _api_get_json(path: str, token: str | None) -> dict | list:
    url = f"{GITHUB_API_BASE}{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": _USER_AGENT,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = _open_url(url, headers)
    except urllib.error.HTTPError as exc:
        _raise_for_http_error(exc, f"GitHub API request to {path}")
    return json.loads(response.read())


def resolve_release(tag_or_latest: str, token: str | None, repo: str) -> dict:
    """Returns the release JSON object for an exact tag, or the newest
    published (non-draft, non-prerelease) release whose tag starts with
    'data-' when `tag_or_latest == "latest"`."""
    if tag_or_latest == "latest":
        releases = _api_get_json(f"/repos/{repo}/releases?per_page=100", token)
        if not isinstance(releases, list):
            raise ArtifactFetchError("GitHub API returned an unexpected response listing releases.")
        candidates = [
            r
            for r in releases
            if not r.get("draft")
            and not r.get("prerelease")
            and str(r.get("tag_name", "")).startswith("data-")
        ]
        if not candidates:
            raise ArtifactFetchError(
                f"No published (non-draft, non-prerelease) release with a tag starting with "
                f"'data-' found in {repo}. Run scripts/publish_data_artifact.py --publish first."
            )
        return candidates[0]  # GitHub lists releases newest-first

    release = _api_get_json(f"/repos/{repo}/releases/tags/{tag_or_latest}", token)
    if not isinstance(release, dict):
        raise ArtifactFetchError(
            f"GitHub API returned an unexpected response for release tag '{tag_or_latest}'."
        )
    return release


def _find_asset(release: dict, name: str) -> dict:
    for asset in release.get("assets", []):
        if asset.get("name") == name:
            return asset
    raise ArtifactFetchError(
        f"Release '{release.get('tag_name', '?')}' has no asset named '{name}' "
        f"(found: {[a.get('name') for a in release.get('assets', [])]})."
    )


def _asset_download_target(asset: dict, token: str | None) -> tuple[str, dict[str, str]]:
    """Authenticated (private-repo) downloads use the API asset-download
    endpoint with Accept: application/octet-stream; unauthenticated
    (public-repo) downloads use the plain browser_download_url."""
    if token:
        return asset["url"], {
            "Accept": "application/octet-stream",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": _USER_AGENT,
        }
    return asset["browser_download_url"], {"User-Agent": _USER_AGENT}


def _download_asset_bytes(asset: dict, token: str | None) -> bytes:
    url, headers = _asset_download_target(asset, token)
    try:
        response = _open_url(url, headers)
    except urllib.error.HTTPError as exc:
        _raise_for_http_error(exc, f"downloading asset '{asset.get('name')}'")
    return response.read()


def _download_asset_to_file(asset: dict, dest: Path, token: str | None) -> None:
    url, headers = _asset_download_target(asset, token)
    try:
        response = _open_url(url, headers)
    except urllib.error.HTTPError as exc:
        _raise_for_http_error(exc, f"downloading asset '{asset.get('name')}'")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_artifact(tag_or_latest: str, token: str | None, repo: str) -> str:
    """Core logic, separated from `main()` so tests can call it directly
    with a temp-file WAREHOUSE_PATH/MANIFEST_PATH override. Returns a
    human-readable success message; raises ArtifactFetchError on any
    failure -- the last-known-good local warehouse is left completely
    untouched whenever this raises."""
    release = resolve_release(tag_or_latest, token, repo)
    manifest_asset = _find_asset(release, MANIFEST_ASSET_NAME)
    warehouse_asset = _find_asset(release, WAREHOUSE_ASSET_NAME)

    manifest_bytes = _download_asset_bytes(manifest_asset, token)
    try:
        manifest = json.loads(manifest_bytes)
    except json.JSONDecodeError as exc:
        raise ArtifactFetchError(f"Downloaded manifest is not valid JSON: {exc}") from exc

    expected_sha = manifest.get("warehouse_sha256")
    expected_build_id = manifest.get("build_id")
    if not expected_sha or not expected_build_id:
        raise ArtifactFetchError(
            "Downloaded manifest is missing 'warehouse_sha256' or 'build_id' -- refusing to "
            "trust it."
        )

    if WAREHOUSE_PATH.exists() and sha256_file(WAREHOUSE_PATH) == expected_sha:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_bytes(manifest_bytes)
        return (
            f"Warehouse already up to date (build_id={expected_build_id}); skipped re-downloading "
            f"the {WAREHOUSE_ASSET_NAME} asset."
        )

    tmp_warehouse = WAREHOUSE_PATH.with_suffix(WAREHOUSE_PATH.suffix + ".partial")
    _download_asset_to_file(warehouse_asset, tmp_warehouse, token)
    actual_sha = sha256_file(tmp_warehouse)
    if actual_sha != expected_sha:
        tmp_warehouse.unlink(missing_ok=True)
        raise ArtifactFetchError(
            f"Downloaded warehouse SHA-256 mismatch (expected={expected_sha}, "
            f"actual={actual_sha}). Refusing to replace the existing warehouse with a "
            "corrupted download."
        )

    # Both assets are downloaded and validated -- only now do we touch
    # the real paths, and both together, so a crash between these two
    # lines can never leave a warehouse/manifest pair that disagree.
    WAREHOUSE_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_warehouse.replace(WAREHOUSE_PATH)
    MANIFEST_PATH.write_bytes(manifest_bytes)

    return (
        f"Verified and installed warehouse at {WAREHOUSE_PATH} "
        f"(build_id={expected_build_id}, {manifest.get('total_rows', 0):,} total rows)."
    )


def main() -> int:
    tag_or_latest = os.environ.get("DATA_ARTIFACT_RELEASE_TAG")
    if not tag_or_latest:
        print(
            "ERROR: DATA_ARTIFACT_RELEASE_TAG is not set. Set it to an exact release tag "
            "published by scripts/publish_data_artifact.py (e.g. data-prod-20260714T221846Z), "
            "or to 'latest' to resolve the newest published data-* release.",
            file=sys.stderr,
        )
        return 1

    token = os.environ.get("DATA_ARTIFACT_GITHUB_TOKEN") or None

    try:
        message = fetch_artifact(tag_or_latest, token, GITHUB_REPO)
    except ArtifactFetchError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
