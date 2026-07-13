"""Phase 2 orchestration: fetch -> validate -> normalize -> quality-check
every geography source adapter, harmonize across sources, and load the
DuckDB warehouse. Wired into `make data` (geography-only at this phase --
health/social/utilization sources land in Phase 3).

Usage: uv run --package scc-health-pipeline python -m scc_health_pipeline.run_geography_pipeline
"""

from __future__ import annotations

import sys
from pathlib import Path

from scc_health_pipeline.geography.harmonize import harmonize_geography
from scc_health_pipeline.geography.warehouse_loader import load_geography_tables
from scc_health_pipeline.sources.base import FetchContext, SourceAdapter
from scc_health_pipeline.sources.census_county_cartographic import (
    CensusCountyCartographicAdapter,
)
from scc_health_pipeline.sources.census_zcta_cartographic import (
    CensusZctaCartographicAdapter,
)
from scc_health_pipeline.sources.census_zcta_tract_relationship import (
    CensusZctaTractRelationshipAdapter,
)
from scc_health_pipeline.sources.manifest import record_artifact
from scc_health_pipeline.sources.scc_supervisor_districts import SccSupervisorDistrictsAdapter
from scc_health_pipeline.sources.tiger_place import TigerPlace2020Adapter
from scc_health_pipeline.sources.tiger_tract import TigerTract2020Adapter

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = REPO_ROOT / "data" / "raw"
STAGED_DIR = REPO_ROOT / "data" / "staged"
CURATED_DIR = REPO_ROOT / "data" / "curated"
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"

_MANIFEST_METADATA = {
    "tiger_tract_2020": dict(
        publisher="U.S. Census Bureau",
        landing_page="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
        source_vintage="2020",
        release_date="2021-02-02",
        native_geography="census tract (full resolution)",
        license_or_terms="Public domain (U.S. government work)",
    ),
    "tiger_place_2020": dict(
        publisher="U.S. Census Bureau",
        landing_page="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
        source_vintage="2020",
        release_date="2021-02-02",
        native_geography="incorporated place (full resolution)",
        license_or_terms="Public domain (U.S. government work)",
    ),
    "census_county_cartographic_2020": dict(
        publisher="U.S. Census Bureau",
        landing_page="https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html",
        source_vintage="2020",
        release_date="2021",
        native_geography="county (cartographic 1:500,000)",
        license_or_terms="Public domain (U.S. government work)",
    ),
    "census_zcta_cartographic_2020": dict(
        publisher="U.S. Census Bureau",
        landing_page="https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html",
        source_vintage="2020",
        release_date="2021",
        native_geography="ZCTA (cartographic 1:500,000)",
        license_or_terms="Public domain (U.S. government work)",
    ),
    "census_zcta_tract_relationship_2020": dict(
        publisher="U.S. Census Bureau",
        landing_page="https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/2020-zcta-record-layout.html",
        source_vintage="2020",
        release_date="2021",
        native_geography="ZCTA-to-tract area relationship",
        license_or_terms="Public domain (U.S. government work)",
    ),
    "scc_supervisor_districts_2025": dict(
        publisher="Santa Clara County Department of Planning and Development",
        landing_page="https://www.arcgis.com/home/item.html?id=eb0277c396494f98b71d8781e417464d",
        source_vintage="2025-09-25",
        release_date="2025-09-25",
        native_geography="supervisor district polygon",
        license_or_terms=(
            "Public, no use constraints per SCCDPD (see docs/data/source-verification.md)"
        ),
    ),
}


def _run_adapter(adapter: SourceAdapter) -> list[Path] | None:
    context = FetchContext(raw_dir=RAW_DIR)
    resources = adapter.discover()
    all_normalized: list[Path] = []
    for resource in resources:
        print(f"[{adapter.source_id}] fetching {resource.resource_id} ...")
        artifact = adapter.fetch(resource, context)
        raw_report = adapter.validate_raw(artifact)
        if not raw_report.passed:
            print(f"[{adapter.source_id}] RAW VALIDATION FAILED:")
            for issue in raw_report.issues:
                print(f"  - {issue.severity}: {issue.message}")
            return None
        for issue in raw_report.issues:
            print(f"  - {issue.severity}: {issue.message}")

        metadata = _MANIFEST_METADATA[adapter.source_id]
        record_artifact(
            artifact,
            publisher=metadata["publisher"],
            landing_page=metadata["landing_page"],
            source_vintage=metadata["source_vintage"],
            release_date=metadata["release_date"],
            native_geography=metadata["native_geography"],
            license_or_terms=metadata["license_or_terms"],
            adapter_version="1.0.0",
        )

        normalized = adapter.normalize(artifact)
        all_normalized.extend(normalized)

    quality_report = adapter.quality_checks(all_normalized)
    for issue in quality_report.issues:
        print(f"[{adapter.source_id}] quality {issue.severity}: {issue.message}")
    if not quality_report.passed:
        print(f"[{adapter.source_id}] QUALITY CHECKS FAILED.")
        return None

    print(f"[{adapter.source_id}] OK -> {[str(p) for p in all_normalized]}")
    return all_normalized


def main() -> int:
    adapters: list[SourceAdapter] = [
        TigerTract2020Adapter(),
        TigerPlace2020Adapter(),
        CensusCountyCartographicAdapter(),
        CensusZctaCartographicAdapter(),
        SccSupervisorDistrictsAdapter(),
        CensusZctaTractRelationshipAdapter(),
    ]

    failures: list[str] = []
    for adapter in adapters:
        result = _run_adapter(adapter)
        if result is None:
            failures.append(adapter.source_id)

    if failures:
        print(f"\nGeography pipeline FAILED for: {failures}")
        print("Preserving any prior curated snapshot; not corrupting warehouse.")
        return 1

    print("\nHarmonizing geography across sources...")
    harmonize_result = harmonize_geography(STAGED_DIR, CURATED_DIR)
    for warning in harmonize_result.warnings:
        print(f"  - warning: {warning}")
    print(
        f"  tracts={harmonize_result.tract_count} places={harmonize_result.place_count} "
        f"zctas={harmonize_result.zcta_count} "
        f"boundary_crossing_tracts={harmonize_result.boundary_crossing_tract_count} "
        f"unincorporated_tracts={harmonize_result.unincorporated_tract_count}"
    )

    print("\nLoading DuckDB warehouse...")
    crosswalk_path = (
        STAGED_DIR / "census_zcta_tract_relationship_2020" / "zcta_tract_crosswalk.parquet"
    )
    unassigned_path = (
        STAGED_DIR / "census_zcta_tract_relationship_2020" / "unassigned_tract_land.parquet"
    )
    summary = load_geography_tables(
        WAREHOUSE_PATH, harmonize_result.curated_paths, crosswalk_path, unassigned_path
    )
    print(f"  build_id={summary.build_id}")
    for table, count in summary.table_row_counts.items():
        print(f"  geo.{table}: {count} rows")

    print("\nGeography pipeline complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
