# Geography Methodology

Status: Phase 2, implemented and audited. This document explains *how* the canonical geography spine is built, complementing `DATA_DICTIONARY.md` (what the tables contain) and `docs/data/source-verification.md` (where the source data comes from).

## 1. Canonical unit

The 2020 Census tract is the canonical neighborhood unit for this platform (`DECISIONS.md` DEC-004). Every tract GEOID is an 11-character string (`06085` county prefix + 6-character tract code), never a number — leading zeros are load-bearing and are audited on every build (`geography_audits.py::_audit_leading_zeros_and_duplicates`).

## 2. Source-to-canonical pipeline

```text
TIGER/Line 2020 tract shapefile (California, full resolution)
  → filter to COUNTYFP == "085"
  → assign canonical tract_geoid_2020
  → reproject to EPSG:4326 for storage
  → geo.tracts
```

Places, the county boundary, and ZCTAs follow an analogous fetch → filter → normalize path but are **not** the canonical unit — they are auxiliary geographies joined to tracts for display and crosswalking, and their native geometry is always retained rather than clipped or reprojected away.

## 3. Why cartographic (not raw) boundaries for county and ZCTA

Raw TIGER/Line only publishes county and ZCTA boundaries as single national files (no per-state partition), making them disproportionately large for a single-county build (the national county file is 80.6MB; Santa Clara County is one of over 3,000 counties in it). Census's own cartographic (generalized) boundary files, published from the same TIGER/Line program at 1:500,000 scale, are used instead for these two layers only (`DECISIONS.md` DEC-013). Every record from these layers carries `geometry_precision = "cartographic_500k"` so a downstream consumer can tell precision was traded for practicality, rather than discovering it by comparing coordinates.

Tract and place boundaries use full-resolution, state-partitioned TIGER/Line files, since the tract is the canonical analytical unit where geometric precision matters most.

## 4. Supervisor district assignment

Santa Clara County's Board of Supervisors districts do not align to tract boundaries — a tract can and does straddle a district line. The assignment method is:

1. Reproject both tracts and districts to EPSG:3310 (NAD83 California Albers, an equal-area projection) so area comparisons are accurate.
2. For each tract, compute its area of intersection with every district it overlaps.
3. The tract's `supervisor_district` is the district holding the **largest** share of the tract's area (majority-area-overlap).
4. If that majority share is below 95%, the tract is flagged `is_clean_assignment = false`, and **every** overlapping district's share is retained in `all_district_shares` — not discarded once the majority winner is picked.

In the Phase 2 build, 408 tracts were assigned with 100% coverage (no orphaned tracts); 35 tracts (8.6%) were boundary-crossing, with primary shares ranging from ~53% to ~99% among the flagged set. This is disclosed, not smoothed over, because a scenario or metric that later aggregates by district needs to know when a tract's district membership is genuinely ambiguous.

### Why this source, not another

Two candidate Santa Clara County supervisor-district boundary datasets were found on ArcGIS Online during Phase 2 (both published by `SCC.Planning.Office`). One (`Supervisorial_Districts_2021`) has only `OBJECTID`/`Shape__Area`/`Shape__Length` fields — no way to verify which `OBJECTID` corresponds to official District 1–5. The other (`PlanningOfficeDataService2` layer 5) carries explicit `DISTRICT` and `SUPERVISOR` fields matching current officeholders, and was more recently modified. The labeled source was used; the unlabeled one was evaluated and rejected (`DECISIONS.md` DEC-012). Guessing "OBJECTID 1 = District 1" would have been exactly the kind of unverified assumption CLAUDE.md prohibits.

## 4.5. Place (city) assignment

Phase 6.5 added `geo.tract_place_assignment`, built by the **identical** majority-land-area-overlap method as supervisor-district assignment above (§4) — reproject to EPSG:3310, compute each tract's intersection area with every incorporated place it touches, assign the majority-share place as `place_geoid`, and flag `is_clean_assignment = false` below the same 95% threshold, retaining every overlapping place's share in `all_place_shares`.

This deliberately replaced an earlier, lighter-weight implementation that used `ST_Contains(place.geometry, tract.internal_point)` (point-in-polygon against the tract's single representative point) — a reasonable-looking shortcut that turned out to disagree with the majority-overlap result for 35 of 408 tracts once measured live, confirming it was a real methodological choice, not a cosmetic one (`DECISIONS.md` DEC-053). Using one consistent, audited method for both the city and district relationships avoids a tract appearing to belong to different cities depending on which part of the platform computed the answer.

In the live build, all 408 tracts received a place assignment (Santa Clara County has no tract with zero overlap onto any incorporated place at all), though 106 tracts (26%) are boundary-crossing at the <95% threshold — some quite marginally (the lowest observed primary share was ~2%, a tract that is overwhelmingly unincorporated county land but technically clips a city boundary at its edge). This is disclosed via `is_clean_assignment`/`all_place_shares`, not smoothed over — a UI showing "this tract is in San Jose" should treat a low-confidence assignment differently from a clean one if that distinction matters to the use case.

## 5. ZIP/ZCTA-to-tract crosswalk

The default (keyless) crosswalk is the Census 2020 ZCTA-to-tract area relationship file (`DECISIONS.md` DEC-005), not the HUD USPS crosswalk, because HUD's crosswalk now requires free account registration (discovered during Phase 0 source verification) — the spec's own documented fallback ordering was followed.

### Weight computation

For each ZCTA that touches a Santa Clara County tract:

```text
weight(zcta, tract) = area_land_part(zcta, tract) / total_area_land(zcta, all tracts nationally)
```

The denominator is computed across **all** of a ZCTA's tracts nationally, not just its Santa Clara County portion, because a ZCTA can straddle a county line (Census ZCTA and county boundaries are independent). Using only the county-local rows as the denominator would overstate each tract's share whenever the ZCTA extends elsewhere. This means a given ZCTA's Santa-Clara-County weights can legitimately sum to less than 1 (the remainder belongs to tracts outside the county) — the audit (`crosswalk_weight_sums`) checks that sums fall in `(0, 1]`, not that they equal exactly 1.

### A cautionary finding: ZCTA/FIPS collisions

While building this crosswalk, a naive substring search for `"06085"` against the raw relationship file matched not only Santa Clara County tract rows but also a row where **ZCTA `06085`** (a Connecticut ZIP code, Burlington CT) appeared as a value in an unrelated column — the ZCTA code numerically collides with Santa Clara County's FIPS code. The adapter (`census_zcta_tract_relationship.py`) filters using the exact field position (`GEOID_TRACT_20`, sliced to its first 5 characters), never a substring match anywhere in the row, specifically because of this discovery. This is recorded here as a concrete illustration of why `docs/02_DATA_SOURCE_REGISTRY.md`'s "never join by string similarity" rule exists.

### Unassigned land slivers

4 small parcels of Santa Clara County tract land have zero ZCTA overlap in the relationship file (a genuine, if rare, characteristic of the source data — likely unpopulated boundary slivers). These are retained in `geo.crosswalk_unassigned_tract_land` rather than silently dropped, so a future consumer summing crosswalk weights against total tract area can account for the gap instead of being confused by an apparent shortfall.

## 6. Audit coverage

`make audit` (via `pipelines/src/scc_health_pipeline/audits/geography_audits.py`) checks, against the live warehouse: GEOID length/uniqueness, county-prefix consistency, plausible row-count ranges, geometry validity (`ST_IsValid`) for every geography table, WGS84 coordinate plausibility (a coarse CRS/reprojection sanity check), crosswalk weight-sum bounds, orphan-geography detection (crosswalk or district-assignment rows referencing a nonexistent tract), spatial-join coverage (percentage of tracts with a district assignment — 100% in the Phase 2 build), and two hand-verified examples (a known tract GEOID, and the expected district-number set `[1,2,3,4,5]`).
