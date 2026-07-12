"""CalEnviroScreen 5.0 (final release), tract level.

Verified live 2026-07-12. **Final** (non-draft) release confirmed at
https://data.ca.gov/dataset/calenviroscreen-5-0 (dataset ID
72b28c84-ceac-4886-9f71-d422470d2223), finalized July 1, 2026. CSV:
https://data.ca.gov/dataset/72b28c84-ceac-4886-9f71-d422470d2223/resource/
c4e277e0-cf23-4a8f-b07e-c8544c5d3d2b/download/calenviroscreen50_070126.csv
-- filename carries an `_f_`-equivalent "070126" (final release date)
token; the file itself has no "draft" marker in its data or filename.

A separate, stale **draft** dataset persists at
https://data.ca.gov/dataset/draft-calenviroscreen-5-0 (ID
b38b4e2c-7ef0-47b3-bff0-29e0a80c8ed8, filenames use a `_d_` draft marker,
e.g. calenviroscreen50csv_d_12226.csv) -- this adapter's pinned URL
deliberately targets only the final dataset ID; `quality_checks` includes
a guard that fails loudly if the resolved URL ever contains "draft".

CalEnviroScreen 5.0 adds two indicators not present in 4.0 (Diabetes
Prevalence `diabetes`/`diabetesP` and Small Air Toxic Sites
`SmATS`/`SmATSP`) and is not directly comparable to 4.0-era scores
(DECISIONS.md DEC-007).
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry

ADAPTER_VERSION = "1.0.0"

RELEASE_LABEL = "CalEnviroScreen 5.0 (final)"
FINALIZED_DATE = "2026-07-01"

_FINAL_DATASET_ID = "72b28c84-ceac-4886-9f71-d422470d2223"
_FINAL_RESOURCE_ID = "c4e277e0-cf23-4a8f-b07e-c8544c5d3d2b"
_URL = (
    f"https://data.ca.gov/dataset/{_FINAL_DATASET_ID}/resource/{_FINAL_RESOURCE_ID}"
    "/download/calenviroscreen50_070126.csv"
)

# Fields carried through unchanged from the source CSV (verified column
# list from a live download, 2026-07-12), aside from the tract rename.
_INDICATOR_COLUMNS = [
    "CIscore",
    "CIscoreP",
    "ozone",
    "ozoneP",
    "pm",
    "pmP",
    "diesel",
    "dieselP",
    "pest",
    "pestP",
    "RSEIhaz",
    "RSEIhazP",
    "traffic",
    "trafficP",
    "drink",
    "drinkP",
    "lead",
    "leadP",
    "cleanups",
    "cleanupsP",
    "gwthreats",
    "gwthreatsP",
    "haz",
    "hazP",
    "iwb",
    "iwbP",
    "swis",
    "swisP",
    "SmATS",
    "SmATSP",  # new in 5.0: Small Air Toxic Sites
    "Pollution",
    "PollutionS",
    "PollutionP",
    "asthma",
    "asthmaP",
    "lbw",
    "lbwP",
    "cvd",
    "cvdP",
    "diabetes",
    "diabetesP",  # new in 5.0: Diabetes Prevalence
    "edu",
    "eduP",
    "ling",
    "lingP",
    "pov",
    "povP",
    "unemp",
    "unempP",
    "housingB",
    "housingBP",
    "PopChar",
    "PopCharSco",
    "PopCharP",
]

_EXPECTED_TRACT_COUNT = 408


class CalEnviroScreenAdapter:
    source_id = "calenviroscreen_5_0"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="calenviroscreen50_final_statewide",
                url=_URL,
                expected_content_type="text/csv",
                description=(
                    f"{RELEASE_LABEL}, statewide tract data; filtered to Santa "
                    "Clara County client-side (no server-side county filter "
                    "available for this CSV export)."
                ),
            )
        ]

    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact:
        if "draft" in resource.url.lower():
            raise ValueError(
                "Refusing to fetch a CalEnviroScreen URL containing 'draft' -- "
                "this adapter must only ever target the final release (DEC-007)."
            )
        return fetch_with_retry(resource, context, source_id=self.source_id)

    def validate_raw(self, artifact: RawArtifact) -> ValidationReport:
        report = ValidationReport()
        if "draft" in artifact.url.lower():
            report.add_error(
                "Fetched artifact URL contains 'draft' -- this must never happen; "
                "refusing to treat draft CalEnviroScreen data as final."
            )
        if artifact.status == "unavailable":
            report.add_error(f"Fetch failed: {artifact.notes}")
            return report
        if artifact.local_path is None or not artifact.local_path.exists():
            report.add_error("No local file recorded.")
            return report
        if artifact.bytes < 1_000_000:
            report.add_error(
                f"CalEnviroScreen CSV implausibly small ({artifact.bytes} bytes); "
                "expected ~7.5MB statewide file."
            )
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        df = pl.read_csv(
            artifact.local_path,
            infer_schema_length=10000,
            schema_overrides={"tract": pl.Utf8, "zipcode": pl.Utf8},
        )
        df = df.filter(pl.col("county") == "Santa Clara")

        select_cols = [
            pl.col("tract").str.zfill(11).alias("tract_geoid_2020"),
            pl.col("zipcode"),
            pl.col("approx_loc").alias("approximate_location"),
            pl.col("ACS2024Pop").alias("acs_population"),
        ]
        select_cols.extend(pl.col(c) for c in _INDICATOR_COLUMNS if c in df.columns)
        select_cols.append(pl.lit(RELEASE_LABEL).alias("release_vintage"))
        select_cols.append(pl.lit(FINALIZED_DATE).alias("release_date"))

        out = df.select(select_cols)

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "calenviroscreen.parquet"
        out.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("Normalized CalEnviroScreen table is empty.")
            return report

        if df.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error("Some CalEnviroScreen tract GEOIDs are not 11 characters.")
        if df.filter(~pl.col("tract_geoid_2020").str.starts_with("06085")).height > 0:
            report.add_error(
                "Some CalEnviroScreen rows reference a tract outside Santa Clara County."
            )
        if df["tract_geoid_2020"].n_unique() != df.height:
            report.add_error("Duplicate tract GEOIDs found in CalEnviroScreen data.")

        distinct_tracts = df["tract_geoid_2020"].n_unique()
        if distinct_tracts != _EXPECTED_TRACT_COUNT:
            report.add_warning(
                f"CalEnviroScreen covers {distinct_tracts} distinct Santa Clara County "
                f"tracts, expected {_EXPECTED_TRACT_COUNT}. CalEnviroScreen excludes "
                "tracts with zero population; a mismatch may be expected."
            )

        if "diabetes" not in df.columns or "SmATS" not in df.columns:
            report.add_error(
                "Expected 5.0-specific indicators (diabetes, SmATS) are missing -- "
                "this may indicate the adapter is accidentally reading a 4.0-era file."
            )

        if "CIscoreP" in df.columns:
            out_of_range = df.filter(
                pl.col("CIscoreP").is_not_null()
                & ((pl.col("CIscoreP") < 0) | (pl.col("CIscoreP") > 100))
            )
            if out_of_range.height > 0:
                report.add_error(f"{out_of_range.height} rows have CIscoreP outside [0, 100].")

        return report
