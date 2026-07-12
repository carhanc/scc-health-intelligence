#!/usr/bin/env python3
"""Copy the curated Phase 2 geography outputs (fetched live from official
sources) into data/demo/geography/ as a checked-in, deterministic offline
snapshot.

Per docs/04_ARCHITECTURE_IMPLEMENTATION.md §22, demo mode must use "small
checked-in source fixtures or versioned last-known-good public extracts"
and "never invented production values." This copies the real curated
Santa Clara County geography data (public domain / no-use-constraints
sources, see docs/data/source-verification.md) verbatim -- it is real data,
just a frozen point-in-time snapshot for offline use, clearly labeled as
such in data/demo/geography/README.md.

Run after a live `make data` run; commit the resulting small Parquet files.
"""

from __future__ import annotations

import shutil
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CURATED_DIR = REPO_ROOT / "data" / "curated"
STAGED_CROSSWALK_DIR = REPO_ROOT / "data" / "staged" / "census_zcta_tract_relationship_2020"
DEMO_DIR = REPO_ROOT / "data" / "demo" / "geography"

_CURATED_FILES = [
    "tracts.parquet",
    "places.parquet",
    "zctas.parquet",
    "county.parquet",
    "supervisor_districts.parquet",
    "tract_supervisor_district_assignment.parquet",
]
_CROSSWALK_FILES = [
    "zcta_tract_crosswalk.parquet",
    "unassigned_tract_land.parquet",
]


def main() -> None:
    DEMO_DIR.mkdir(parents=True, exist_ok=True)

    missing = [f for f in _CURATED_FILES if not (CURATED_DIR / f).exists()]
    missing += [f for f in _CROSSWALK_FILES if not (STAGED_CROSSWALK_DIR / f).exists()]
    if missing:
        raise SystemExit(
            f"Cannot build demo snapshot -- missing curated/staged files: {missing}. "
            "Run `make data` first to fetch live data."
        )

    for filename in _CURATED_FILES:
        shutil.copy2(CURATED_DIR / filename, DEMO_DIR / filename)
        print(f"copied {filename}")

    for filename in _CROSSWALK_FILES:
        shutil.copy2(STAGED_CROSSWALK_DIR / filename, DEMO_DIR / filename)
        print(f"copied {filename}")

    readme = DEMO_DIR / "README.md"
    readme.write_text(
        f"""# Demo Geography Snapshot

**This is real data, not fabricated.** These Parquet files are a frozen,
point-in-time copy of the live Phase 2 geography pipeline output, generated
by `scripts/build_demo_geography_snapshot.py` on {datetime.now(UTC).isoformat()}.

Sources (see `docs/data/source-verification.md` for full provenance):

- `tracts.parquet` -- 2020 Census tract boundaries (TIGER/Line), Santa Clara County
- `places.parquet` -- 2020 incorporated place boundaries touching Santa Clara County
- `zctas.parquet` -- cartographic ZCTA boundaries touching Santa Clara County
- `county.parquet` -- Santa Clara County boundary (cartographic)
- `supervisor_districts.parquet` -- Board of Supervisors district boundaries
  (Santa Clara County Dept. of Planning and Development)
- `tract_supervisor_district_assignment.parquet` -- tract-to-district
  majority-area-overlap assignment
- `zcta_tract_crosswalk.parquet` / `unassigned_tract_land.parquet` --
  Census 2020 ZCTA-to-tract area relationship crosswalk

**Do not treat this as a live, current data feed.** `make demo` builds an
offline demo warehouse from this snapshot without any network access; the
UI must visibly label demo mode as such and never present it as live data
(docs/04_ARCHITECTURE_IMPLEMENTATION.md §22). For current data, run
`make data`.
""",
        encoding="utf-8",
    )
    print(f"wrote {readme}")
    print("Demo snapshot build complete.")


if __name__ == "__main__":
    main()
