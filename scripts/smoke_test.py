#!/usr/bin/env python3
"""Production smoke test (Phase 9): a fast, real end-to-end check that a
running deployment (or local dev servers) actually works, not just that
it responds with a 200.

Checks the backend directly (health/readiness/version, one real query
against each major analytics area, one deterministic Advocate
generation, one deterministic Copilot ask) and confirms the frontend
responds. Browser-level checks (console errors, axe-core accessibility)
are handled separately by `apps/web/e2e/production-smoke.spec.ts` (run
with SMOKE_TEST_BASE_URL set) -- this script is backend-focused and has
no browser dependency, so it can run anywhere `httpx` is installed.

Usage:
    uv run python scripts/smoke_test.py \\
        --frontend-url http://localhost:3000 \\
        --backend-url http://localhost:8000
"""

from __future__ import annotations

import argparse
import sys

import httpx


class SmokeTestFailure(Exception):
    pass


def check(description: str, fn) -> None:  # type: ignore[no-untyped-def]
    try:
        fn()
    except SmokeTestFailure as exc:
        print(f"  FAIL  {description}: {exc}")
        raise
    except Exception as exc:  # noqa: BLE001 -- any unexpected error is a real smoke-test failure
        print(f"  FAIL  {description}: unexpected error: {exc}")
        raise SmokeTestFailure(str(exc)) from exc
    else:
        print(f"  PASS  {description}")


def run(frontend_url: str, backend_url: str) -> int:
    client = httpx.Client(timeout=30.0)
    failures = 0

    def _get(path: str, **kwargs):  # type: ignore[no-untyped-def]
        response = client.get(f"{backend_url}{path}", **kwargs)
        if response.status_code >= 400:
            raise SmokeTestFailure(f"{path} returned {response.status_code}: {response.text[:200]}")
        return response

    checks = []

    def _frontend_loads() -> None:
        response = client.get(frontend_url)
        if response.status_code >= 400:
            raise SmokeTestFailure(f"frontend returned {response.status_code}")

    checks.append(("Frontend loads", _frontend_loads))

    def _backend_health() -> None:
        body = _get("/api/v1/health").json()
        if body.get("status") != "ok":
            raise SmokeTestFailure(f"unexpected health body: {body}")

    checks.append(("Backend /health", _backend_health))

    def _backend_ready() -> None:
        response = client.get(f"{backend_url}/api/v1/ready")
        body = response.json()
        if not body.get("ready"):
            raise SmokeTestFailure(f"backend is not ready: {body}")

    checks.append(("Backend /ready", _backend_ready))

    def _backend_version() -> None:
        body = _get("/api/v1/version").json()
        if not body.get("data_build_id"):
            raise SmokeTestFailure(
                "data_build_id is null -- no production manifest found "
                "(run scripts/build_production_manifest.py before deploying)"
            )

    checks.append(("Backend /version reports a real data build", _backend_version))

    def _explore_query() -> None:
        body = _get("/api/v1/geographies/search", params={"q": "Sunnyvale"}).json()
        if not body.get("results"):
            raise SmokeTestFailure("Explore search for 'Sunnyvale' returned no results")

    checks.append(("Explore: geography search", _explore_query))

    def _prioritize_query() -> None:
        body = _get("/api/v1/scenarios").json()
        if not body.get("scenarios"):
            raise SmokeTestFailure("Prioritize scenario list is empty")

    checks.append(("Prioritize: scenario list", _prioritize_query))

    def _access_lab_query() -> None:
        body = _get("/api/v1/access/facilities").json()
        if not body.get("facilities"):
            raise SmokeTestFailure("Access Lab facility list is empty")

    checks.append(("Access Lab: facility list", _access_lab_query))

    def _utilization_query() -> None:
        body = _get("/api/v1/utilization/county-trends").json()
        if not body.get("points"):
            raise SmokeTestFailure(f"Utilization county-trends looks empty: keys={list(body)}")

    checks.append(("Utilization: county trends", _utilization_query))

    def _validate_query() -> None:
        _get("/api/v1/validate/audit-status")

    checks.append(("Validate: audit status", _validate_query))

    def _advocate_generate() -> None:
        search = _get("/api/v1/geographies/search", params={"q": "Sunnyvale"}).json()
        place_result = next((r for r in search["results"] if r["geography_type"] == "place"), None)
        if place_result is None:
            raise SmokeTestFailure("no place result for Sunnyvale to build an Advocate brief from")
        evidence = _get(
            "/api/v1/advocate/evidence",
            params={
                "geography_type": "place",
                "geography_id": place_result["geography_id"],
                "scenario_id": "default_integrated_screen_v1",
            },
        ).json()
        if not evidence.get("items"):
            raise SmokeTestFailure("no evidence items returned for Sunnyvale")
        response = client.post(
            f"{backend_url}/api/v1/advocate/generate",
            json={
                "output_type": "one_page_brief",
                "geography_label": evidence["geography_label"],
                "scenario_id": "default_integrated_screen_v1",
                "audience": "public",
                "evidence": [evidence["items"][0]],
                "notes": "",
                "data_mode": evidence["data_mode"],
            },
        )
        if response.status_code >= 400:
            raise SmokeTestFailure(
                f"Advocate /generate returned {response.status_code}: {response.text[:200]}"
            )
        body = response.json()
        if "sections" not in body:
            raise SmokeTestFailure(
                f"Advocate /generate response missing sections: keys={list(body)}"
            )

    checks.append(("Advocate: deterministic brief generation", _advocate_generate))

    def _copilot_ask() -> None:
        response = client.post(
            f"{backend_url}/api/v1/copilot/ask",
            json={
                "action": "list_what_cannot_be_concluded",
                "instruction": "",
                "evidence": [],
                "use_llm": False,
            },
        )
        if response.status_code >= 400:
            raise SmokeTestFailure(
                f"Copilot /ask returned {response.status_code}: {response.text[:200]}"
            )
        body = response.json()
        if body.get("is_ai_generated") is not False:
            raise SmokeTestFailure(
                "expected a deterministic (non-AI-generated) response with use_llm=False"
            )

    checks.append(("Copilot: deterministic ask", _copilot_ask))

    print(f"Smoke testing frontend={frontend_url} backend={backend_url}\n")
    for description, fn in checks:
        try:
            check(description, fn)
        except SmokeTestFailure:
            failures += 1

    print(f"\n{len(checks) - failures}/{len(checks)} checks passed.")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend-url", required=True)
    parser.add_argument("--backend-url", required=True)
    args = parser.parse_args()
    return run(args.frontend_url.rstrip("/"), args.backend_url.rstrip("/"))


if __name__ == "__main__":
    sys.exit(main())
