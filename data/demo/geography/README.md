# Demo Geography Snapshot

**This is real data, not fabricated.** These Parquet files are a frozen,
point-in-time copy of the live Phase 2 geography pipeline output, generated
by `scripts/build_demo_geography_snapshot.py` on 2026-07-11T23:52:53.558612+00:00.

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
