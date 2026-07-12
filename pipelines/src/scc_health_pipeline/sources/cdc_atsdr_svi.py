"""CDC/ATSDR Social Vulnerability Index (SVI) 2022, tract level.

Verified live 2026-07-12. SVI 2022 remains the current release (no 2024
cycle found). The interactive download page is JavaScript-driven with no
stable direct-download CSV URL; the reliable programmatic path is CDC's
own ArcGIS FeatureServer, confirmed live:
https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2
(layer 2 = US tract level), which returned exactly 408 Santa Clara County
tract records on verification -- matching the Phase 2 geography spine.

Underlying observation period: field aliases in the live service confirm
estimates are drawn from ACS 2018-2022 (distinct from the "SVI 2022"
release label -- both facts preserved per the Phase 3 data-vintage
transparency requirement).

Percentile ranks (RPL_*) are SVI-release-specific and must never be
compared across different SVI release years (docs/03_ANALYTICS_METHODS.md
"SVI" notes) -- this adapter tags every row with a release_vintage field
for exactly that reason.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlencode

import polars as pl

from scc_health_pipeline.geography.constants import COUNTY_GEOID_SANTA_CLARA
from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)
from scc_health_pipeline.sources.http_fetch import fetch_with_retry

ADAPTER_VERSION = "1.0.0"

RELEASE_LABEL = "SVI 2022"
UNDERLYING_OBSERVATION_PERIOD = "ACS 2018-2022 5-year estimates"

_FEATURE_SERVER = (
    "https://onemap.cdc.gov/onemapservices/rest/services/SVI/"
    "CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2"
)

_OUT_FIELDS = [
    "FIPS",
    "LOCATION",
    "E_TOTPOP",
    "M_TOTPOP",
    # Theme 1: Socioeconomic Status
    "EP_POV150",
    "MP_POV150",
    "EP_UNEMP",
    "MP_UNEMP",
    "EP_HBURD",
    "MP_HBURD",
    "EP_NOHSDP",
    "MP_NOHSDP",
    "EP_UNINSUR",
    "MP_UNINSUR",
    "SPL_THEME1",
    "RPL_THEME1",
    "F_THEME1",
    # Theme 2: Household Characteristics
    "EP_AGE65",
    "MP_AGE65",
    "EP_AGE17",
    "MP_AGE17",
    "EP_DISABL",
    "MP_DISABL",
    "EP_SNGPNT",
    "MP_SNGPNT",
    "EP_LIMENG",
    "MP_LIMENG",
    "SPL_THEME2",
    "RPL_THEME2",
    "F_THEME2",
    # Theme 3: Racial and Ethnic Minority Status
    "EP_MINRTY",
    "MP_MINRTY",
    "SPL_THEME3",
    "RPL_THEME3",
    "F_THEME3",
    # Theme 4: Housing Type / Transportation
    "EP_MUNIT",
    "MP_MUNIT",
    "EP_MOBILE",
    "MP_MOBILE",
    "EP_CROWD",
    "MP_CROWD",
    "EP_NOVEH",
    "MP_NOVEH",
    "EP_GROUPQ",
    "MP_GROUPQ",
    "SPL_THEME4",
    "RPL_THEME4",
    "F_THEME4",
    # Overall summary
    "SPL_THEMES",
    "RPL_THEMES",
    "F_TOTAL",
]

_QUERY_URL = f"{_FEATURE_SERVER}/query?" + urlencode(
    {
        "where": f"STCNTY='{COUNTY_GEOID_SANTA_CLARA}'",
        "outFields": ",".join(_OUT_FIELDS),
        "returnGeometry": "false",
        "f": "json",
    }
)

_EXPECTED_TRACT_COUNT = 408
# SVI documents -999 as a missing-data sentinel for percentile/estimate
# fields where the underlying ACS data was unavailable.
_MISSING_DATA_SENTINEL = -999


class CdcAtsdrSviAdapter:
    source_id = "cdc_atsdr_svi_2022"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="svi_2022_tract_santa_clara",
                url=_QUERY_URL,
                expected_content_type="application/json",
                description=(
                    f"{RELEASE_LABEL} tract-level data, Santa Clara County, "
                    "via CDC's ArcGIS FeatureServer (no stable static CSV found)."
                ),
            )
        ]

    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact:
        return fetch_with_retry(resource, context, source_id=self.source_id)

    def validate_raw(self, artifact: RawArtifact) -> ValidationReport:
        report = ValidationReport()
        if artifact.status == "unavailable":
            report.add_error(f"Fetch failed: {artifact.notes}")
            return report
        if artifact.local_path is None or not artifact.local_path.exists():
            report.add_error("No local file recorded.")
            return report
        import json

        try:
            with artifact.local_path.open(encoding="utf-8") as fh:
                payload = json.load(fh)
        except json.JSONDecodeError as exc:
            report.add_error(f"Response is not valid JSON: {exc}")
            return report
        if "error" in payload:
            report.add_error(f"ArcGIS service returned an error: {payload['error']}")
        if "features" not in payload:
            report.add_error("Response has no 'features' key -- unexpected ArcGIS response shape.")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []
        import json

        with artifact.local_path.open(encoding="utf-8") as fh:
            payload = json.load(fh)

        rows = [f["attributes"] for f in payload.get("features", [])]
        if not rows:
            staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
            staged_dir.mkdir(parents=True, exist_ok=True)
            out_path = staged_dir / "svi.parquet"
            pl.DataFrame(schema={"tract_geoid_2020": pl.Utf8}).write_parquet(out_path)
            return [out_path]

        df = pl.DataFrame(rows)
        df = df.with_columns(
            [
                pl.col("FIPS").cast(pl.Utf8).str.zfill(11).alias("tract_geoid_2020"),
                pl.lit(RELEASE_LABEL).alias("release_vintage"),
                pl.lit(UNDERLYING_OBSERVATION_PERIOD).alias("underlying_observation_period"),
            ]
        ).drop("FIPS")

        # Replace the -999 missing-data sentinel with null + a flag column,
        # never leaving -999 as a literal value that downstream code might
        # average or plot as if it were real (CLAUDE.md failure rules).
        numeric_cols = [
            c for c in df.columns if c.startswith(("E_", "M_", "EP_", "MP_", "SPL_", "RPL_"))
        ]
        for col in numeric_cols:
            df = df.with_columns(
                pl.when(pl.col(col) == _MISSING_DATA_SENTINEL)
                .then(None)
                .otherwise(pl.col(col))
                .alias(col)
            )
        df = df.with_columns(
            pl.any_horizontal([pl.col(c) == _MISSING_DATA_SENTINEL for c in numeric_cols])
            .fill_null(False)
            .alias("had_suppressed_field")
            if numeric_cols
            else pl.lit(False).alias("had_suppressed_field")
        )

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        out_path = staged_dir / "svi.parquet"
        df.write_parquet(out_path)
        return [out_path]

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if not normalized_paths:
            report.add_error("No normalized output produced.")
            return report

        df = pl.read_parquet(normalized_paths[0])
        if df.is_empty():
            report.add_error("Normalized SVI table is empty.")
            return report

        if df.filter(pl.col("tract_geoid_2020").str.len_chars() != 11).height > 0:
            report.add_error("Some SVI tract GEOIDs are not 11 characters.")
        if (
            df.filter(~pl.col("tract_geoid_2020").str.starts_with(COUNTY_GEOID_SANTA_CLARA)).height
            > 0
        ):
            report.add_error("Some SVI rows reference a tract outside Santa Clara County.")
        if df["tract_geoid_2020"].n_unique() != df.height:
            report.add_error("Duplicate tract GEOIDs found in SVI data.")

        distinct_tracts = df["tract_geoid_2020"].n_unique()
        if distinct_tracts != _EXPECTED_TRACT_COUNT:
            report.add_warning(
                f"SVI covers {distinct_tracts} distinct tracts, expected {_EXPECTED_TRACT_COUNT}."
            )

        if "RPL_THEMES" in df.columns:
            out_of_range = df.filter(
                pl.col("RPL_THEMES").is_not_null()
                & ((pl.col("RPL_THEMES") < 0) | (pl.col("RPL_THEMES") > 1))
            )
            if out_of_range.height > 0:
                report.add_error(
                    f"{out_of_range.height} rows have RPL_THEMES outside the valid [0, 1] "
                    "percentile range (after sentinel-value handling)."
                )

        return report
