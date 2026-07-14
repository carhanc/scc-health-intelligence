#!/usr/bin/env python3
"""Download a published data artifact into place for a hosted deployment (Phase 9).

Run as part of the backend's build/start step on Render (see
docs/deployment/production-deployment-guide.md). Downloads
`scc_health.duckdb` from a specific GitHub Release (identified by tag)
into `warehouse/scc_health.duckdb`, verifying its SHA-256 against the
accompanying manifest before accepting it -- a corrupted or truncated
download must never silently become "the production warehouse."

Requires the DATA_ARTIFACT_RELEASE_TAG environment variable (e.g.
"data-prod-20260714T221846Z", the tag `publish_data_artifact.py` created)
and downloads via the public, unauthenticated GitHub Releases download
URL -- no token needed for a public repo's public release assets.

Writes to the SAME paths the API itself reads (`Settings.
scc_health_warehouse_path`, `Settings.data_manifest_path`) -- on a hosted
deployment with a persistent disk mounted outside the repo checkout
(e.g. Render), set SCC_HEALTH_WAREHOUSE_PATH to a path on that disk so
the downloaded file survives across deploys; this script and the API
process agree on where it lives because both read it from the same
Settings object, not a second hardcoded path.

Usage:
    DATA_ARTIFACT_RELEASE_TAG=data-prod-20260714T221846Z \\
        uv run python scripts/fetch_data_artifact.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api/src"))
from scc_health_api.settings import get_settings  # noqa: E402

_settings = get_settings()
WAREHOUSE_PATH = _settings.scc_health_warehouse_path
MANIFEST_PATH = _settings.data_manifest_path

# Set via an env var (not hardcoded) so this works for any fork without
# editing source -- defaults to the project's own repo.
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "carhanc/scc-health-intelligence")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    with urllib.request.urlopen(url) as response, tmp.open("wb") as out:  # noqa: S310 -- fixed https://github.com URL, not user input
        shutil_copyfileobj(response, out)
    tmp.replace(dest)


def shutil_copyfileobj(fsrc, fdst, length: int = 1024 * 1024) -> None:
    while True:
        chunk = fsrc.read(length)
        if not chunk:
            break
        fdst.write(chunk)


def main() -> int:
    tag = os.environ.get("DATA_ARTIFACT_RELEASE_TAG")
    if not tag:
        print(
            "ERROR: DATA_ARTIFACT_RELEASE_TAG is not set. Set it to the release tag "
            "published by scripts/publish_data_artifact.py (e.g. data-prod-20260714T221846Z).",
            file=sys.stderr,
        )
        return 1

    base_url = f"https://github.com/{GITHUB_REPO}/releases/download/{tag}"
    print(f"Fetching data artifact from release '{tag}' ({base_url})...")

    try:
        download(f"{base_url}/DATA_MANIFEST.production.json", MANIFEST_PATH)
        download(f"{base_url}/scc_health.duckdb", WAREHOUSE_PATH)
    except OSError as exc:
        print(f"ERROR: download failed: {exc}", file=sys.stderr)
        return 1

    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        manifest = json.load(fh)
    expected_sha = manifest.get("warehouse_sha256")
    actual_sha = sha256_file(WAREHOUSE_PATH)
    if expected_sha != actual_sha:
        print(
            f"ERROR: downloaded warehouse SHA-256 mismatch. "
            f"expected={expected_sha} actual={actual_sha}. Refusing to use a corrupted artifact.",
            file=sys.stderr,
        )
        WAREHOUSE_PATH.unlink(missing_ok=True)
        return 1

    print(
        f"Verified and installed warehouse at {WAREHOUSE_PATH} "
        f"(build_id={manifest.get('build_id')}, {manifest.get('total_rows'):,} total rows)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
