#!/usr/bin/env python3
"""Local end-to-end simulation of the private-repository deployment
pipeline (Phase 9 pre-deployment correction pass) -- no real network
call, no real cloud resource, but every other step is genuine:

1. Builds a real production manifest from the real local warehouse.
2. Simulates GitHub's authenticated private-release API (a fake HTTP
   transport, exactly like scripts/tests/test_fetch_data_artifact.py's
   own tests) serving that REAL manifest and the REAL warehouse bytes.
3. Runs the real `fetch_data_artifact.fetch_artifact()` against that
   fake transport, downloading into a temporary "persistent disk"
   directory -- exercising the real atomic-download and SHA-256-
   verification code path.
4. Points a fresh FastAPI app instance at that downloaded warehouse
   with SCC_HEALTH_ENVIRONMENT=production and confirms /api/v1/ready
   and /api/v1/version both succeed against it -- proving the whole
   chain (private download -> disk -> API startup -> readiness) works,
   not just each piece in isolation.

This is a verification tool, safe to re-run any time; it never touches
the real warehouse file, never makes a real network call, and cleans up
its own temp directory.

Usage:
    uv run python scripts/simulate_private_deployment.py
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "apps/api/src"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))


def main() -> int:
    real_warehouse = REPO_ROOT / "warehouse" / "scc_health.duckdb"
    if not real_warehouse.exists():
        print(
            f"ERROR: no real warehouse at {real_warehouse}. Run `make data` first.",
            file=sys.stderr,
        )
        return 1

    tmp_dir = Path(tempfile.mkdtemp(prefix="scc_health_deploy_sim_"))
    try:
        return _run_simulation(real_warehouse, tmp_dir)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _run_simulation(real_warehouse: Path, tmp_dir: Path) -> int:
    import hashlib

    print(f"Simulation workspace: {tmp_dir}\n")

    # Step 1: point Settings at a fake "persistent disk" BEFORE importing
    # anything that reads it -- Settings is read once at import time.
    sim_warehouse_path = tmp_dir / "data" / "scc_health.duckdb"
    sim_manifest_path = tmp_dir / "DATA_MANIFEST.production.json"
    os.environ["SCC_HEALTH_WAREHOUSE_PATH"] = str(sim_warehouse_path)
    os.environ["SCC_HEALTH_DEMO_WAREHOUSE_PATH"] = str(tmp_dir / "data" / "no_such_demo.duckdb")
    os.environ["SCC_HEALTH_ENVIRONMENT"] = "production"
    os.environ.pop("SENTRY_DSN", None)

    import fetch_data_artifact as fda  # noqa: E402 -- import after env vars are set

    real_sha = hashlib.sha256(real_warehouse.read_bytes()).hexdigest()
    real_bytes_size = real_warehouse.stat().st_size
    print(
        f"Step 1: real local warehouse -- {real_bytes_size / 1_048_576:.1f} MB, "
        f"sha256={real_sha[:16]}..."
    )

    # Step 2: a real manifest, shaped exactly like build_production_manifest.py produces.
    manifest = {
        "build_id": "sim-deploy-test",
        "built_at": "2026-01-01T00:00:00+00:00",
        "warehouse_sha256": real_sha,
        "warehouse_bytes": real_bytes_size,
        "total_tables": 1,
        "total_rows": 1,
    }
    manifest_bytes = json.dumps(manifest).encode()
    print("Step 2: built a real manifest referencing the real warehouse's actual SHA-256.")

    # Step 3: simulate GitHub's authenticated private-release API.
    repo = "carhanc/scc-health-intelligence"
    tag = "data-sim-deploy-test"
    release = {
        "tag_name": tag,
        "draft": False,
        "prerelease": False,
        "assets": [
            {
                "name": fda.MANIFEST_ASSET_NAME,
                "url": f"https://api.github.com/repos/{repo}/releases/assets/1",
                "browser_download_url": "https://unused-in-authenticated-path.invalid",
            },
            {
                "name": fda.WAREHOUSE_ASSET_NAME,
                "url": f"https://api.github.com/repos/{repo}/releases/assets/2",
                "browser_download_url": "https://unused-in-authenticated-path.invalid",
            },
        ],
    }

    calls: list[str] = []

    class _FakeResponse:
        def __init__(self, body: bytes):
            self._body = body
            self._pos = 0

        def read(self, n: int | None = None) -> bytes:
            if n is None:
                out, self._pos = self._body[self._pos :], len(self._body)
                return out
            out = self._body[self._pos : self._pos + n]
            self._pos += len(out)
            return out

    def fake_open_url(url: str, headers: dict):
        calls.append(url)
        assert headers.get("Authorization") == "Bearer sim-fake-token", (
            "authenticated private-repo path must send the token"
        )
        if url == f"https://api.github.com/repos/{repo}/releases/tags/{tag}":
            return _FakeResponse(json.dumps(release).encode())
        if url == release["assets"][0]["url"]:
            return _FakeResponse(manifest_bytes)
        if url == release["assets"][1]["url"]:
            return _FakeResponse(real_warehouse.read_bytes())
        raise AssertionError(f"unexpected URL in simulation: {url}")

    fda._open_url = fake_open_url  # type: ignore[assignment]
    fda.WAREHOUSE_PATH = sim_warehouse_path
    fda.MANIFEST_PATH = sim_manifest_path

    print("Step 3: simulating GitHub's authenticated private-release API (no real network call)...")
    message = fda.fetch_artifact(tag, "sim-fake-token", repo)
    print(f"  {message}")
    assert len(calls) == 3, f"expected 3 authenticated API calls, got {len(calls)}"
    assert sim_warehouse_path.exists(), "warehouse was not written to the simulated disk"
    assert sim_manifest_path.exists(), "manifest was not written to the simulated disk"
    print(
        "Step 3 PASSED: authenticated download, atomic install, and SHA-256 verification "
        "all succeeded.\n"
    )

    # Step 4: start a real FastAPI app instance pointed at the downloaded
    # warehouse and confirm production readiness actually works.
    print("Step 4: starting the real API app against the simulated deployment disk...")
    import importlib

    import scc_health_api.main as main_module
    from fastapi.testclient import TestClient

    importlib.reload(main_module)  # re-read Settings now that env vars are set
    with TestClient(main_module.app) as client:
        ready_response = client.get("/api/v1/ready")
        version_response = client.get("/api/v1/version")

    assert ready_response.status_code == 200, (
        f"/api/v1/ready returned {ready_response.status_code}: {ready_response.text}"
    )
    assert ready_response.json()["ready"] is True, ready_response.json()
    assert version_response.status_code == 200
    print(f"  /api/v1/ready -> {ready_response.json()}")
    print(f"  /api/v1/version -> {version_response.json()}")
    print(
        "Step 4 PASSED: the API started in production mode and served both endpoints "
        "successfully.\n"
    )

    print("=== Local end-to-end deployment simulation: ALL STEPS PASSED ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
