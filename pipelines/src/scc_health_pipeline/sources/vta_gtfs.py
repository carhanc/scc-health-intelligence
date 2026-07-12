"""VTA (Santa Clara Valley Transportation Authority) static GTFS feed.

Verified live 2026-07-12: https://gtfs.vta.org/gtfs_vta.zip resolves (4.996MB
zip, last-modified 2026-06-02). feed_info.txt confirms feed_version
"2026-06-01_10:34", valid 2026-04-27 through 2026-08-09 -- this window is
the authoritative freshness signal, not the HTTP last-modified date alone.

The zip is Mac-zipped and contains `__MACOSX/` junk entries alongside the
real GTFS tables; these are filtered out during parsing.

No GTFS-realtime feed was found for VTA during Phase 3 source verification
(checked VTA's open-data portal, Transitland, and public feed aggregators)
-- this adapter produces *scheduled* service data only. Any accessibility
calculation built on this data (Phase 6) must be labeled "scheduled
service," never implied to reflect live/realtime conditions
(docs/02_DATA_SOURCE_REGISTRY.md §6.1).
"""

from __future__ import annotations

import zipfile
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

_URL = "https://gtfs.vta.org/gtfs_vta.zip"

_REQUIRED_TABLES = ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
# GTFS requires at least one of calendar.txt / calendar_dates.txt.
_CALENDAR_TABLES = ["calendar.txt", "calendar_dates.txt"]

# Santa Clara County (and immediately adjacent service area) plausible
# lat/lon bounding box -- VTA's service area can extend slightly beyond
# the county line into neighboring counties (e.g. shared regional routes).
_LAT_MIN, _LAT_MAX = 36.7, 37.7
_LON_MIN, _LON_MAX = -122.5, -121.0


class VtaGtfsAdapter:
    source_id = "vta_gtfs"

    def discover(self) -> list[RemoteResource]:
        return [
            RemoteResource(
                resource_id="gtfs_vta",
                url=_URL,
                expected_content_type="application/zip",
                description=(
                    "VTA static GTFS feed (scheduled service only, no realtime feed found)."
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
        try:
            with zipfile.ZipFile(artifact.local_path) as zf:
                names = {n for n in zf.namelist() if not n.startswith("__MACOSX")}
        except zipfile.BadZipFile as exc:
            report.add_error(f"GTFS file is not a valid zip archive: {exc}")
            return report

        for required in _REQUIRED_TABLES:
            if required not in names:
                report.add_error(f"Required GTFS table '{required}' is missing from the feed.")
        if not any(cal in names for cal in _CALENDAR_TABLES):
            report.add_error("Neither calendar.txt nor calendar_dates.txt is present.")
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        if artifact.local_path is None:
            return []

        staged_dir = artifact.local_path.parents[1] / "staged" / self.source_id
        staged_dir.mkdir(parents=True, exist_ok=True)
        outputs: list[Path] = []

        with zipfile.ZipFile(artifact.local_path) as zf:
            feed_version, feed_start, feed_end = self._read_feed_info(zf)

            stops = self._read_table(zf, "stops.txt")
            stops = stops.with_columns(
                [
                    pl.col("stop_lat").cast(pl.Float64, strict=False),
                    pl.col("stop_lon").cast(pl.Float64, strict=False),
                ]
            )
            stops_path = staged_dir / "stops.parquet"
            stops.write_parquet(stops_path)
            outputs.append(stops_path)

            routes = self._read_table(zf, "routes.txt")
            routes_path = staged_dir / "routes.parquet"
            routes.write_parquet(routes_path)
            outputs.append(routes_path)

            trips = self._read_table(zf, "trips.txt")
            trips_path = staged_dir / "trips.parquet"
            trips.write_parquet(trips_path)
            outputs.append(trips_path)

            stop_times = self._read_table(zf, "stop_times.txt")
            stop_times_path = staged_dir / "stop_times.parquet"
            stop_times.write_parquet(stop_times_path)
            outputs.append(stop_times_path)

            calendar = (
                self._read_table(zf, "calendar.txt")
                if "calendar.txt" in {n for n in zf.namelist() if not n.startswith("__MACOSX")}
                else pl.DataFrame()
            )
            calendar_path = staged_dir / "calendar.parquet"
            calendar.write_parquet(calendar_path)
            outputs.append(calendar_path)

            # Curated: stop-level scheduled-trip-count frequency summary,
            # counting distinct trips serving each stop (a coarse
            # "service frequency" proxy for Phase 6 access analysis --
            # not a claim about actual headways or realtime reliability).
            frequency = (
                stop_times.group_by("stop_id")
                .agg(pl.col("trip_id").n_unique().alias("distinct_trips_serving_stop"))
                .join(
                    stops.select(["stop_id", "stop_name", "stop_lat", "stop_lon"]),
                    on="stop_id",
                    how="left",
                )
            )
            frequency = frequency.with_columns(
                [
                    pl.lit(feed_version).alias("feed_version"),
                    pl.lit(feed_start).alias("feed_start_date"),
                    pl.lit(feed_end).alias("feed_end_date"),
                ]
            )
            frequency_path = staged_dir / "stop_frequency_summary.parquet"
            frequency.write_parquet(frequency_path)
            outputs.append(frequency_path)

        return outputs

    # GTFS identifier columns must always be read as strings -- they are
    # opaque IDs per the GTFS spec, not numbers, and some (e.g. VTA's
    # purely-numeric trip_id/shape_id values) get silently misread as
    # Int64 by default schema inference, breaking joins against sibling
    # tables where the same ID appears alongside alphanumeric values
    # (e.g. stop_id "EL_VIR" in stops.txt vs. a numeric-looking stop_id
    # elsewhere) -- discovered the hard way during Phase 3 development.
    _ID_COLUMNS = [
        "stop_id",
        "route_id",
        "trip_id",
        "service_id",
        "shape_id",
        "agency_id",
        "block_id",
        "zone_id",
        "parent_station",
    ]

    @classmethod
    def _read_table(cls, zf: zipfile.ZipFile, name: str) -> pl.DataFrame:
        with zf.open(name) as fh:
            header = fh.readline().decode("utf-8-sig").strip()
        present_columns = set(header.split(","))
        overrides = {col: pl.Utf8 for col in cls._ID_COLUMNS if col in present_columns}
        with zf.open(name) as fh:
            return pl.read_csv(fh, infer_schema_length=10000, schema_overrides=overrides)

    @staticmethod
    def _read_feed_info(zf: zipfile.ZipFile) -> tuple[str | None, str | None, str | None]:
        names = {n for n in zf.namelist() if not n.startswith("__MACOSX")}
        if "feed_info.txt" not in names:
            return None, None, None
        with zf.open("feed_info.txt") as fh:
            df = pl.read_csv(fh)
        if df.is_empty():
            return None, None, None
        row = df.row(0, named=True)
        return (
            row.get("feed_version"),
            str(row.get("feed_start_date")) if row.get("feed_start_date") else None,
            str(row.get("feed_end_date")) if row.get("feed_end_date") else None,
        )

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        if len(normalized_paths) < 6:
            report.add_error(f"Expected 6 normalized GTFS outputs, got {len(normalized_paths)}.")
            return report

        stops, routes, trips, stop_times, calendar, frequency = normalized_paths

        stops_df = pl.read_parquet(stops)
        if stops_df.is_empty():
            report.add_error("stops.txt normalized to an empty table.")
        else:
            out_of_bounds = stops_df.filter(
                pl.col("stop_lat").is_not_null()
                & pl.col("stop_lon").is_not_null()
                & (
                    (pl.col("stop_lat") < _LAT_MIN)
                    | (pl.col("stop_lat") > _LAT_MAX)
                    | (pl.col("stop_lon") < _LON_MIN)
                    | (pl.col("stop_lon") > _LON_MAX)
                )
            )
            if out_of_bounds.height > 0:
                report.add_warning(
                    f"{out_of_bounds.height} stops fall outside the plausible VTA service-area "
                    "bounding box -- verify these aren't a coordinate parsing error."
                )
            if stops_df.filter(pl.col("stop_id").is_null()).height > 0:
                report.add_error("Some stops have a null stop_id.")
            if stops_df["stop_id"].n_unique() != stops_df.height:
                report.add_error("Duplicate stop_id values found in stops.txt.")

        routes_df = pl.read_parquet(routes)
        trips_df = pl.read_parquet(trips)
        stop_times_df = pl.read_parquet(stop_times)

        if routes_df.is_empty():
            report.add_error("routes.txt normalized to an empty table.")
        if trips_df.is_empty():
            report.add_error("trips.txt normalized to an empty table.")
        if stop_times_df.is_empty():
            report.add_error("stop_times.txt normalized to an empty table.")

        # Foreign-key checks: every trip's route_id must exist in routes;
        # every stop_time's trip_id must exist in trips; every stop_time's
        # stop_id must exist in stops.
        if not routes_df.is_empty() and not trips_df.is_empty():
            orphan_trip_routes = trips_df.join(
                routes_df.select("route_id"), on="route_id", how="anti"
            )
            if orphan_trip_routes.height > 0:
                report.add_error(
                    f"{orphan_trip_routes.height} trips reference a route_id "
                    "absent from routes.txt."
                )

        if not trips_df.is_empty() and not stop_times_df.is_empty():
            orphan_stop_time_trips = stop_times_df.join(
                trips_df.select("trip_id"), on="trip_id", how="anti"
            )
            if orphan_stop_time_trips.height > 0:
                report.add_error(
                    f"{orphan_stop_time_trips.height} stop_times reference a trip_id absent "
                    "from trips.txt."
                )

        if not stops_df.is_empty() and not stop_times_df.is_empty():
            orphan_stop_time_stops = stop_times_df.join(
                stops_df.select("stop_id"), on="stop_id", how="anti"
            )
            if orphan_stop_time_stops.height > 0:
                report.add_error(
                    f"{orphan_stop_time_stops.height} stop_times reference a stop_id absent "
                    "from stops.txt."
                )

        calendar_df = pl.read_parquet(calendar)
        if calendar_df.is_empty():
            report.add_warning(
                "calendar.txt normalized to an empty table -- verify calendar_dates.txt "
                "is being used as the service-date source instead, per GTFS spec."
            )

        frequency_df = pl.read_parquet(frequency)
        if frequency_df.is_empty():
            report.add_error("Stop frequency summary is empty.")
        elif frequency_df["feed_version"][0] is None:
            report.add_warning(
                "feed_info.txt did not yield a feed_version -- freshness cannot be "
                "labeled precisely."
            )

        return report
