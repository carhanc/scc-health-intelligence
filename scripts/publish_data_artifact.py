#!/usr/bin/env python3
"""Package the production warehouse + manifest as a GitHub Release asset (Phase 9).

Two steps, always run in this order:

1. Build (always run, always safe, no credentials needed): copies
   `warehouse/scc_health.duckdb` and the manifest produced by
   `build_production_manifest.py` into `data-artifact/<build_id>/`,
   ready to upload.
2. Publish (opt-in via --publish, requires `gh` authenticated with repo
   write access): creates a GitHub Release tagged `data-<build_id>` on
   this repo and uploads both files as release assets. This is the
   mechanism `.github/workflows/scheduled-refresh.yml` calls after a
   verified-good `make data && make audit` run -- a failed or partial
   build is never published (see build_production_manifest.py's own
   fail-loud checks, which run first and must succeed before this script
   does anything).

Without --publish, this script only builds the local artifact directory
and prints the exact `gh` commands a human (or the scheduled-refresh
workflow, which has real `gh` credentials) would run -- never claims to
have published something it didn't.

Usage:
    uv run python scripts/publish_data_artifact.py
    uv run python scripts/publish_data_artifact.py --publish
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "DATA_MANIFEST.production.json"
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"
ARTIFACT_DIR = REPO_ROOT / "data-artifact"


def build_artifact() -> Path:
    if not MANIFEST_PATH.exists():
        print(
            "ERROR: no production manifest found. Run "
            "`uv run python scripts/build_production_manifest.py` first.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not WAREHOUSE_PATH.exists():
        print(f"ERROR: warehouse not found at {WAREHOUSE_PATH}.", file=sys.stderr)
        sys.exit(1)

    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        manifest = json.load(fh)
    build_id: str = manifest["build_id"]

    out_dir = ARTIFACT_DIR / build_id
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(WAREHOUSE_PATH, out_dir / "scc_health.duckdb")
    shutil.copy2(MANIFEST_PATH, out_dir / "DATA_MANIFEST.production.json")

    print(f"Built artifact at {out_dir}")
    print(f"  scc_health.duckdb ({WAREHOUSE_PATH.stat().st_size / 1_048_576:.1f} MB)")
    print("  DATA_MANIFEST.production.json")
    return out_dir


def publish_release(artifact_dir: Path, build_id: str) -> int:
    tag = f"data-{build_id}"
    gh = shutil.which("gh")
    if gh is None:
        print(
            "ERROR: `gh` (GitHub CLI) is not installed or not on PATH. "
            "Install it (https://cli.github.com) and run `gh auth login` first.",
            file=sys.stderr,
        )
        return 1

    create_cmd = [
        gh,
        "release",
        "create",
        tag,
        str(artifact_dir / "scc_health.duckdb"),
        str(artifact_dir / "DATA_MANIFEST.production.json"),
        "--title",
        f"Data artifact {build_id}",
        "--notes",
        f"Production data snapshot built {build_id}. "
        "See DATA_MANIFEST.production.json for provenance.",
    ]
    print("Running:", " ".join(create_cmd))
    result = subprocess.run(create_cmd, cwd=REPO_ROOT, check=False)
    if result.returncode != 0:
        print(f"ERROR: `gh release create` exited {result.returncode}.", file=sys.stderr)
        return result.returncode
    print(f"Published release '{tag}'.")
    return 0


def print_manual_publish_instructions(artifact_dir: Path, build_id: str) -> None:
    tag = f"data-{build_id}"
    print("\nTo publish this artifact as a GitHub Release (requires `gh auth login` first):")
    print(f"  gh release create {tag} \\")
    print(f"    {artifact_dir / 'scc_health.duckdb'} \\")
    print(f"    {artifact_dir / 'DATA_MANIFEST.production.json'} \\")
    print(f'    --title "Data artifact {build_id}" \\')
    print(f'    --notes "Production data snapshot built {build_id}."')
    print("\nOr re-run this script with --publish to have it run that command for you.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Actually create the GitHub Release via `gh` (requires gh auth). "
        "Without this flag, only builds the local artifact and prints the command.",
    )
    args = parser.parse_args()

    artifact_dir = build_artifact()
    with (artifact_dir / "DATA_MANIFEST.production.json").open(encoding="utf-8") as fh:
        build_id = json.load(fh)["build_id"]

    if args.publish:
        return publish_release(artifact_dir, build_id)
    print_manual_publish_instructions(artifact_dir, build_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
