"""Phase 3 orchestration: fetch -> validate -> normalize -> quality-check
every core health/social/resource/utilization source adapter, then load
all normalized outputs into the DuckDB warehouse. Wired into `make data`
alongside the Phase 2 geography pipeline.

Reuses cached raw artifacts (see sources.http_fetch.fetch_with_retry) so
re-running this script after the first successful run is fast and does
not redownload unchanged files.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import duckdb

from scc_health_pipeline.sources.acs_5year import TABLE_IDS as ACS_TABLE_IDS
from scc_health_pipeline.sources.acs_5year import AcsGeoCrosswalkAdapter, AcsTableAdapter
from scc_health_pipeline.sources.base import FetchContext, SourceAdapter
from scc_health_pipeline.sources.ca_hpi import CaHpiAdapter, blocked_manifest_entry
from scc_health_pipeline.sources.calenviroscreen import CalEnviroScreenAdapter
from scc_health_pipeline.sources.cdc_atsdr_svi import CdcAtsdrSviAdapter
from scc_health_pipeline.sources.cdc_places import CdcPlacesAdapter
from scc_health_pipeline.sources.census_population_origins import CenPopBlockGroupAdapter
from scc_health_pipeline.sources.hcai_ed_facility_profile import HcaiEdFacilityProfileAdapter
from scc_health_pipeline.sources.hcai_ed_patient_county import all_breakdown_adapters
from scc_health_pipeline.sources.hcai_facility_attributes import HcaiFacilityAttributesAdapter
from scc_health_pipeline.sources.hcai_patient_origin import HcaiPatientOriginAdapter
from scc_health_pipeline.sources.hrsa_health_centers import HrsaHealthCentersAdapter
from scc_health_pipeline.sources.hrsa_shortage_areas import (
    HrsaMuaAdapter,
    dental_adapter,
    mental_health_adapter,
    primary_care_adapter,
)
from scc_health_pipeline.sources.manifest import load_manifest, record_artifact, save_manifest
from scc_health_pipeline.sources.scc_health_clinics import SccHealthClinicsAdapter
from scc_health_pipeline.sources.usda_snap_retailers import UsdaSnapRetailersAdapter
from scc_health_pipeline.sources.vta_gtfs import VtaGtfsAdapter

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = REPO_ROOT / "data" / "raw"
STAGED_DIR = REPO_ROOT / "data" / "staged"
WAREHOUSE_PATH = REPO_ROOT / "warehouse" / "scc_health.duckdb"


@dataclass
class SourceManifestMeta:
    publisher: str
    landing_page: str
    source_vintage: str
    release_date: str | None
    native_geography: str
    license_or_terms: str


_MANIFEST_META: dict[str, SourceManifestMeta] = {
    "cdc_places_tract_2025": SourceManifestMeta(
        "Centers for Disease Control and Prevention",
        "https://www.cdc.gov/places/tools/data-portal.html",
        "2025 release",
        "2025-12-12",
        "census tract",
        "Public domain (U.S. government work)",
    ),
    "cdc_atsdr_svi_2022": SourceManifestMeta(
        "Agency for Toxic Substances and Disease Registry",
        "https://www.atsdr.cdc.gov/place-health/php/svi/index.html",
        "SVI 2022",
        "2022",
        "census tract",
        "Public domain (U.S. government work)",
    ),
    "calenviroscreen_5_0": SourceManifestMeta(
        "California EPA / OEHHA",
        "https://oehha.ca.gov/calenviroscreen/report/calenviroscreen-50",
        "CalEnviroScreen 5.0 (final)",
        "2026-07-01",
        "census tract",
        "Public, data.ca.gov open-data terms",
    ),
    "hcai_facility_attributes": SourceManifestMeta(
        "California Dept. of Health Care Access and Information (HCAI)",
        "https://hcai.ca.gov/data/data-resources/healthcare-facility-attributes/",
        "rolling/continuous",
        None,
        "facility point",
        "Creative Commons Attribution (CC-BY)",
    ),
    "hrsa_health_center_sites": SourceManifestMeta(
        "Health Resources and Services Administration (HRSA)",
        "https://data.hrsa.gov/data/download?titleFilter=Health+Center",
        "daily refresh",
        None,
        "facility point",
        "Public domain (U.S. government work)",
    ),
    "vta_gtfs": SourceManifestMeta(
        "Santa Clara Valley Transportation Authority (VTA)",
        "https://www.vta.org/open-data-portal",
        "2026-06-01_10:34 (feed_version)",
        None,
        "transit stop/route/trip",
        "Open for developer use (VTA)",
    ),
    "usda_snap_retailers": SourceManifestMeta(
        "USDA Food and Nutrition Administration (FNA, formerly FNS)",
        "https://www.fna.usda.gov/snap/retailer-locator/data",
        "Historical 2005-2025",
        "2026-02-19",
        "retailer point",
        "Public domain (U.S. government work)",
    ),
    "acs_5year_geo_crosswalk": SourceManifestMeta(
        "U.S. Census Bureau",
        "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        "2020-2024 5-year",
        "2026-01-29",
        "census tract (national crosswalk)",
        "Public domain (U.S. government work)",
    ),
    "census_cenpop_2020_block_group": SourceManifestMeta(
        "U.S. Census Bureau",
        "https://www.census.gov/geographies/reference-files/time-series/geo/centers-population.html",
        "2020 Census (Mean Center of Population)",
        "2021-08-12",
        "block group (population-weighted point)",
        "Public domain (U.S. government work)",
    ),
    "scc_health_clinics": SourceManifestMeta(
        "Santa Clara County Public Health Department",
        "https://data-sccphd.opendata.arcgis.com/datasets/sccphd::health-clinics",
        "rolling/continuous",
        None,
        "facility point",
        "County of Santa Clara ArcGIS Hub open-data terms",
    ),
}


def _manifest_meta_for(source_id: str) -> SourceManifestMeta:
    if source_id in _MANIFEST_META:
        return _MANIFEST_META[source_id]
    if source_id.startswith("acs_5year_"):
        return SourceManifestMeta(
            "U.S. Census Bureau",
            "https://www.census.gov/data/developers/data-sets/acs-5year.html",
            "2020-2024 5-year",
            "2026-01-29",
            "census tract",
            "Public domain (U.S. government work)",
        )
    if source_id.startswith("hrsa_hpsa_") or source_id == "hrsa_mua_p":
        return SourceManifestMeta(
            "Health Resources and Services Administration (HRSA)",
            "https://data.hrsa.gov/topics/health-workforce/shortage-areas",
            "daily refresh",
            None,
            "HPSA/MUA designation area",
            "Public domain (U.S. government work)",
        )
    if source_id.startswith("hcai_ed_patient_county_"):
        return SourceManifestMeta(
            "California Dept. of Health Care Access and Information (HCAI)",
            "https://data.chhs.ca.gov/dataset/"
            "hospital-emergency-department-characteristics-by-patient-county-of-residence",
            "2008-2024",
            "2025",
            "patient county of residence",
            "CHHS Terms of Use / HCAI-OPA (no modification; commercial use requires approval)",
        )
    if source_id == "hcai_ed_facility_profile":
        return SourceManifestMeta(
            "California Dept. of Health Care Access and Information (HCAI)",
            "https://data.chhs.ca.gov/dataset/"
            "hospital-emergency-department-characteristics-by-facility-pivot-profile",
            "2024",
            "2025-10-08",
            "facility",
            "CHHS Terms of Use / HCAI-OPA (no modification; commercial use requires approval)",
        )
    if source_id == "hcai_patient_origin_market_share":
        return SourceManifestMeta(
            "California Dept. of Health Care Access and Information (HCAI)",
            "https://data.chhs.ca.gov/dataset/"
            "patient-origin-market-share-pivot-profile-inpatient-emergency-department-and-"
            "ambulatory-surgery",
            "2024",
            "2025-10-08",
            "patient ZIP / facility",
            "CHHS Terms of Use / HCAI-OPA (no modification; commercial use requires approval)",
        )
    raise KeyError(f"No manifest metadata registered for source_id={source_id!r}")


def _run_adapter(adapter: SourceAdapter, context: FetchContext) -> list[Path] | None:
    resources = adapter.discover()
    all_normalized: list[Path] = []
    for resource in resources:
        print(f"[{adapter.source_id}] fetching {resource.resource_id} ...")
        artifact = adapter.fetch(resource, context)
        raw_report = adapter.validate_raw(artifact)
        for issue in raw_report.issues:
            print(f"  - {issue.severity}: {issue.message}")
        if not raw_report.passed:
            print(f"[{adapter.source_id}] RAW VALIDATION FAILED.")
            return None

        meta = _manifest_meta_for(adapter.source_id)
        record_artifact(
            artifact,
            publisher=meta.publisher,
            landing_page=meta.landing_page,
            source_vintage=meta.source_vintage,
            release_date=meta.release_date,
            native_geography=meta.native_geography,
            license_or_terms=meta.license_or_terms,
            adapter_version="1.0.0",
        )
        all_normalized.extend(adapter.normalize(artifact))

    quality_report = adapter.quality_checks(all_normalized)
    for issue in quality_report.issues:
        print(f"[{adapter.source_id}] quality {issue.severity}: {issue.message}")
    if not quality_report.passed:
        print(f"[{adapter.source_id}] QUALITY CHECKS FAILED.")
        return None

    print(f"[{adapter.source_id}] OK -> {len(all_normalized)} output file(s)")
    return all_normalized


def _load_table(conn: duckdb.DuckDBPyConnection, schema: str, table: str, paths: list[Path]) -> int:
    conn.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
    conn.execute(f"DROP TABLE IF EXISTS {schema}.{table}")
    if len(paths) == 1:
        source = f"read_parquet('{paths[0].as_posix()}')"
    else:
        globbed = ", ".join(f"'{p.as_posix()}'" for p in paths)
        source = f"read_parquet([{globbed}], union_by_name=true)"
    conn.execute(f"CREATE TABLE {schema}.{table} AS SELECT * FROM {source}")
    row = conn.execute(f"SELECT COUNT(*) FROM {schema}.{table}").fetchone()
    return int(row[0]) if row else 0


def main() -> int:  # noqa: PLR0915 -- orchestration script, sequential by design
    context = FetchContext(raw_dir=RAW_DIR, timeout_seconds=180)
    failures: list[str] = []
    table_outputs: dict[tuple[str, str], list[Path]] = {}

    def run(adapter: SourceAdapter, schema: str, table: str) -> None:
        result = _run_adapter(adapter, context)
        if result is None:
            failures.append(adapter.source_id)
            return
        table_outputs[(schema, table)] = result

    # --- health.* ---
    run(CdcPlacesAdapter(), "health", "places_observations")

    # --- context.* ---
    run(CdcAtsdrSviAdapter(), "context", "svi")
    run(CalEnviroScreenAdapter(), "context", "calenviroscreen")
    # HPI is documented-blocked (DEC-018) -- record a truthful unavailable
    # manifest entry rather than silently omitting it from the catalog.
    entries = [e for e in load_manifest() if e.get("source_id") != CaHpiAdapter.source_id]
    entries.append(blocked_manifest_entry())
    save_manifest(entries)
    print(f"[{CaHpiAdapter.source_id}] BLOCKED (documented, DEC-018) -- see DATA_MANIFEST.json.")

    # --- social.* (ACS) ---
    geo_result = _run_adapter(AcsGeoCrosswalkAdapter(), context)
    if geo_result is None:
        failures.append(AcsGeoCrosswalkAdapter.source_id)
    else:
        geo_path = geo_result[0]
        acs_tables: list[Path] = []
        for table_id in ACS_TABLE_IDS:
            table_adapter = AcsTableAdapter(table_id, geo_path)
            result = _run_adapter(table_adapter, context)
            if result is None:
                failures.append(table_adapter.source_id)
            else:
                acs_tables.extend(result)
        if acs_tables:
            table_outputs[("social", "acs_observations")] = acs_tables

    # --- geo.* (Phase 6: population-weighted origins) ---
    run(CenPopBlockGroupAdapter(), "geo", "block_group_population_origins")

    # --- resources.* ---
    run(HcaiFacilityAttributesAdapter(), "resources", "hcai_facilities")
    run(HrsaHealthCentersAdapter(), "resources", "hrsa_health_center_sites")
    run(SccHealthClinicsAdapter(), "resources", "scc_health_clinics")
    run(UsdaSnapRetailersAdapter(), "resources", "snap_retailers")

    gtfs_result = _run_adapter(VtaGtfsAdapter(), context)
    if gtfs_result is None:
        failures.append(VtaGtfsAdapter.source_id)
    else:
        names = ["stops", "routes", "trips", "stop_times", "calendar", "stop_frequency_summary"]
        for name, path in zip(names, gtfs_result, strict=True):
            table_outputs[("resources", f"transit_{name}")] = [path]

    hpsa_workforce_tables: list[Path] = []
    for hpsa_adapter in [primary_care_adapter(), dental_adapter(), mental_health_adapter()]:
        result = _run_adapter(hpsa_adapter, context)
        if result is None:
            failures.append(hpsa_adapter.source_id)
        else:
            hpsa_workforce_tables.extend(result)
    if hpsa_workforce_tables:
        table_outputs[("resources", "hrsa_hpsa")] = hpsa_workforce_tables
    run(HrsaMuaAdapter(), "resources", "hrsa_mua_p")

    # --- utilization.* (HCAI) ---
    ed_patient_county_tables: list[Path] = []
    for breakdown_adapter in all_breakdown_adapters():
        result = _run_adapter(breakdown_adapter, context)
        if result is None:
            failures.append(breakdown_adapter.source_id)
        else:
            ed_patient_county_tables.extend(result)
    if ed_patient_county_tables:
        table_outputs[("utilization", "hcai_ed_patient_county")] = ed_patient_county_tables

    run(HcaiEdFacilityProfileAdapter(), "utilization", "hcai_ed_facility_profile")
    run(HcaiPatientOriginAdapter(), "utilization", "hcai_patient_origin")

    if failures:
        print(f"\nCore sources pipeline had failures for: {failures}")
        print("Preserving any prior curated/warehouse snapshot; not corrupting output.")

    print("\nLoading DuckDB warehouse (Phase 3 tables)...")
    WAREHOUSE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(WAREHOUSE_PATH), read_only=False)
    try:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")
        for (schema, table), paths in table_outputs.items():
            count = _load_table(conn, schema, table, paths)
            print(f"  {schema}.{table}: {count} rows ({len(paths)} file(s))")
    finally:
        conn.close()

    print("\nCore sources pipeline complete.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
