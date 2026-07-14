#!/usr/bin/env python3
"""Package the frozen, offline demo geography snapshot as a downloadable
zip (Phase 9 -- `make export-demo`'s real implementation).

`data/demo/geography/` (built by `scripts/build_demo_geography_snapshot.py`,
committed to the repo) is the only Phase-9 demo artifact that is real,
frozen, and requires no live source access or credentials -- see
RISK-019/RISK-029 for the disclosed gap that analytics/utilization tables
have no offline snapshot yet. This script packages exactly that real
geography data into a single zip anyone can download and inspect without
running the platform at all, plus a short README explaining what it is
and, honestly, what it is not (a full analytics demo).
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = REPO_ROOT / "data" / "demo" / "geography"
OUTPUT_PATH = REPO_ROOT / "exports" / "scc_health_demo_geography.zip"

README_TEXT = """\
Santa Clara Health Intelligence -- offline demo geography snapshot
====================================================================

This zip contains the platform's real, frozen Census tract / place /
supervisor-district / ZCTA geography data for Santa Clara County, in
GeoParquet form (readable with GeoPandas, DuckDB's spatial extension,
QGIS, or any Parquet-aware tool).

What this IS: a real, offline-usable snapshot of this platform's
geography reference data -- the same tables `make demo` loads to run the
application without any live network access or API keys.

What this is NOT: this snapshot does not include health/social/context
metrics, computed scores, access/utilization analytics, or resource
inventories -- those currently require a live `make data` build against
real public sources (see RISK_REGISTER.md RISK-019/RISK-029 for why no
offline snapshot exists yet for those tables). Running `make demo` and
browsing the app in demo mode will show real place names and boundaries
with an honest "data unavailable" state for anything beyond geography,
never fabricated numbers.

See DATA_DICTIONARY.md for the schema of each file, and
docs/00_PRODUCT_CHARTER.md for what this platform is for.
"""


def main() -> int:
    if not DEMO_DIR.exists() or not any(DEMO_DIR.glob("*.parquet")):
        print(
            f"ERROR: no demo geography snapshot found at {DEMO_DIR}. "
            "Run `uv run python scripts/build_demo_geography_snapshot.py` first.",
            file=sys.stderr,
        )
        return 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.md", README_TEXT)
        for file in sorted(DEMO_DIR.glob("*")):
            if file.is_file():
                zf.write(file, arcname=f"geography/{file.name}")

    size_mb = OUTPUT_PATH.stat().st_size / 1_048_576
    print(f"Wrote {OUTPUT_PATH} ({size_mb:.2f} MB).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
