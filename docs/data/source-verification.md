# Source Verification — Phase 0

Verified via read-only research against live official pages. **Verification date: 2026-07-11.** This document is the authoritative record required by `docs/07_BUILD_PHASES.md` Phase 0 ("verify current official source pages before coding adapters"). Every adapter built in Phase 3 must match the access method, geography, and license recorded here, or update this document with a dated correction.

Fields recorded per source: publisher/landing page, current vintage, access method, native geography, key requirement, license/terms, known limitations, update cadence, and a status flag (`✅ verified`, `⚠️ changed`, `⚠️ time-sensitive`, `⚠️ partially confirmed`).

---

## 1. CDC PLACES — ✅ verified

- **Publisher / landing page:** Centers for Disease Control and Prevention; `https://www.cdc.gov/places/tools/data-portal.html`
- **Current vintage:** 2025 release. Most of the 40 measures use BRFSS 2023; 5 measures (colorectal cancer screening, mammography use, short sleep duration, dental visit, all teeth lost) use BRFSS 2022. Population denominators from 2020 Census; social-determinant covariates from ACS 2019–2023 (or 2018–2022 depending on measure).
- **Access method:** Socrata datasets on `data.cdc.gov`. Census-tract dataset: **"PLACES: Local Data for Better Health, Census Tract Data, 2025 release"**, dataset ID `cwsq-ngmh` (standard tabular) and a GIS-friendly variant `yjkw-uj5s`. Standard Socrata REST/CSV/GeoJSON API; optional `$$app_token` improves rate limits but is not required.
- **Native geography:** County, place, census tract, and ZCTA are each published as separate dataset pairs (8 total per release). We use the census-tract pair.
- **Key required:** No.
- **License/terms:** U.S. government work, public domain. Cite "CDC PLACES, 2025 release."
- **Limitations:** Model-based small-area estimates (synthetic, not direct tract surveys); 83,522 of 84,112 U.S. tracts covered (tracts with adult population < 50 are excluded — Santa Clara County has negligible such tracts, but the exclusion list must be checked and disclosed); confidence limits (not full CIs) are published per measure; must not be treated as a time series across releases without checking CDC's measure-comparability notes for the given year.
- **Update cadence:** Annual.
- **Adapter implication:** Dataset ID discovery must not be hardcoded permanently — implement a discovery step (query Socrata's dataset catalog/metadata API for the current "PLACES ... Census Tract Data" title) with `cwsq-ngmh` pinned as the last-verified fallback ID, recorded with a `verified_at` timestamp in `config/sources.yml`.

---

## 2. American Community Survey (ACS) 5-year estimates — ⚠️ changed

- **Publisher / landing page:** U.S. Census Bureau; `https://www.census.gov/data/developers/data-sets/acs-5year.html`
- **Current vintage:** 2020–2024 5-year estimates, released January 29, 2026.
- **Access method:** Census Data API (`api.census.gov/data/2024/acs/acs5?get=...&for=tract:*&in=state:06+county:085&key=...`) when `CENSUS_API_KEY` is configured. **Change from the source registry's assumption:** as of ~May 2026, Census now requires an API key for *all* Data API queries, not only high-volume ones. Keyless fallback: `data.census.gov` Download Center / official bulk summary-file downloads (flat CSV), which remain fully open. Per `docs/02_DATA_SOURCE_REGISTRY.md` §4.2's own acquisition order, this bulk path is used whenever `CENSUS_API_KEY` is absent — it was already the documented fallback, just now the primary keyless path rather than a rare fallback.
- **Native geography:** Down to census tract (block group for a subset of tables).
- **Key required:** Yes for the live API (free registration at `api.census.gov/data/key_signup.html`); no for the bulk-download fallback.
- **License/terms:** Public domain.
- **Limitations:** Every estimate carries a published 90%-confidence margin of error; small tracts/low-count cells are suppressed or carry very wide MOEs; the 5-year period is a rolling window, not a single year — must not be compared to non-overlapping periods without significance testing (per `docs/03_ANALYTICS_METHODS.md` §16.1).
- **Update cadence:** Annual (rolling 5-year window).
- **Adapter implication:** Build the keyless bulk-download path as the default/no-key mode; treat `CENSUS_API_KEY` as an optional low-friction free-tier enhancement (faster targeted queries) documented in `.env.example`, not a hard requirement. This is recorded as `DEC-003` in `DECISIONS.md`.

---

## 3. Census TIGER/Line boundary files — ✅ verified (vintage decision required)

- **Publisher / landing page:** U.S. Census Bureau; `https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html`
- **Current vintage:** 2025 TIGER/Line Shapefiles released September 23, 2025 (legal boundaries as of January 1, 2025). The 2020 vintage (aligned to 2020 decennial tract numbering) remains archived and downloadable.
- **Access method:** Direct FTP-style download, e.g. `https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_06_tract.zip` (year/layer/state-FIPS pattern). California state FIPS = `06`; Santa Clara County FIPS = `06085`.
- **Native geography:** Tract, ZCTA, place, block group, county, congressional/legislative district, etc.
- **Key required:** No.
- **License/terms:** Public domain.
- **Limitations:** Geometry + GEOID only, no attribute/demographic data; a tract boundary vintage must match the population-data vintage it is paired with, or GEOIDs will not align.
- **Update cadence:** Annual.
- **Adapter implication:** **Pin to TIGER2020** tract boundaries (not the newer 2025 legal-boundary file) because ACS 5-year, PLACES, and SVI are all published against 2020 Census tract numbering. This is recorded as `DEC-004`.

---

## 4. CDC/ATSDR Social Vulnerability Index (SVI) — ✅ verified

- **Publisher / landing page:** Agency for Toxic Substances and Disease Registry; `https://www.atsdr.cdc.gov/place-health/php/svi/index.html`; downloads at `.../svi-data-documentation-download.html` and `https://svi.cdc.gov/dataDownloads/data-download.html`
- **Current vintage:** **2022** remains the latest published release (release history: 2000, 2010, 2014, 2016, 2018, 2020, 2022 — no 2024 cycle found as of this verification date). The source registry's assumption of SVI 2022 is confirmed correct.
- **Access method:** Direct bulk download, CSV (tabular) and Esri File Geodatabase (map-ready); historically also offered as shapefile. No API, no key.
- **Native geography:** Census tract (county-level rollups also published).
- **Key required:** No.
- **License/terms:** Public domain; cite "CDC/ATSDR SVI 2022."
- **Limitations:** Percentile ranks (0–1 scale) are relative within a release and are **not comparable across release years** (methodology/variable definitions change each cycle); margins of error follow the Census 90%-CI standard for underlying ACS-derived variables; known data corrections have been issued historically for specific theme variables (e.g., MP_CROWD in 2022, Housing Burden in 2020) — check the ATSDR errata page immediately before ingest in Phase 3.
- **Update cadence:** Roughly biennial (2018 → 2020 → 2022 pattern); a 2024 release may post during this build — recheck at Phase 3 implementation time, not just at Phase 0.

---

## 5. HUD USPS ZIP Code Crosswalk — ⚠️ changed

- **Publisher / landing page:** HUD USER; `https://www.huduser.gov/portal/datasets/usps_crosswalk.html`; API docs at `https://www.huduser.gov/portal/dataset/uspszip-api.html`
- **Current vintage:** Quarterly files, current through 2026 Q2/Q3; files have reflected 2020 Census geographies since 2023 Q1.
- **Access method:** **Change from the source registry's assumption of anonymous access:** the portal and API now require free account registration and a bearer token (`huduser.gov/apps/public/uspscrosswalk/login`, token creation at `huduser.gov/hudapi/public/login`). No longer a fully anonymous download.
- **Native geography:** ZIP ↔ tract, county, county subdivision, CBSA, CBSA division, congressional district (12 crosswalk types, 6 per direction). We use ZIP↔tract.
- **Key required:** Yes (free registration + bearer token) for both the API and the UI-gated download.
- **License/terms:** Public; attribute HUD/USPS.
- **Limitations:** ZIP Codes are USPS delivery routes, not areal units — the crosswalk provides residential/business/total address-share allocation weights, not exact geometry; not a substitute for TIGER/Line geometry.
- **Update cadence:** Quarterly.
- **Adapter implication:** Per the source registry's own documented fallback (`docs/02_DATA_SOURCE_REGISTRY.md` §4.4: "If HUD access requires authentication or is unavailable, use the Census 2020 ZCTA-to-tract relationship file... and label the result lower confidence"), the platform will **default to the keyless Census 2020 ZCTA-to-tract relationship file** (`https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/2020-zcta-record-layout.html`) for the no-key mode, and treat the HUD crosswalk as an optional higher-confidence enhancement when a free `HUD_USER_TOKEN` is configured. Recorded as `DEC-005`.

---

## 6. California Healthy Places Index (HPI) — ✅ verified

- **Publisher / landing page:** Public Health Alliance of Southern California; `https://www.healthyplacesindex.org/`
- **Current vintage:** HPI 3.0 (released 2022) remains current — no HPI 4.0 found (site FAQ is titled "HPI 3.0 Frequently Asked Questions").
- **Access method:** Interactive map/data platform with data export from the map tool; no confirmed bulk REST API on the public landing page. 25 indicators across 8 domains, plus 375+ supplemental decision-support layers.
- **Native geography:** Census tract (native); the platform's own ethical-use guidance discourages aggregating to ZIP/county because it masks neighborhood-level variation.
- **Key required:** No.
- **License/terms:** Free for noncommercial use (education, government, community organizations) with attribution to the Public Health Alliance of Southern California. Terms: `https://www.healthyplacesindex.org/terms-and-conditions`. Ethical-use guidance PDF: `https://phasocal.org/wp-content/uploads/2023/06/PHA_HPI_Guidance_Report523_4.pdf`.
- **Limitations:** Must be used as a contextual benchmark, not copied into a new composite score without avoiding double-counting against our own domains (per `docs/02` §7.1); direction is "higher = healthier," opposite of our concern-oriented domain scores — requires explicit sign handling.
- **Update cadence:** No fixed cadence; major version releases occur multi-year apart (2.0 → 3.0 was several years).

---

## 7. CalEnviroScreen — ⚠️ time-sensitive

- **Publisher / landing page:** California EPA / Office of Environmental Health Hazard Assessment (OEHHA); `https://oehha.ca.gov/calenviroscreen/report/calenviroscreen-50`
- **Current vintage:** **CalEnviroScreen 5.0 was finalized July 1, 2026** — ten days before this verification — superseding CalEnviroScreen 4.0. A draft 5.0 was released January 28, 2026 with public comment through April 1, 2026, then finalized. CalEPA's Final 2026 Disadvantaged Communities designation is now based on 5.0.
- **Access method:** Bulk data download via `data.ca.gov`; Technical Report PDF on `oehha.ca.gov` documents methodology. **Caution:** a separate, now-stale "Draft CalEnviroScreen 5.0" dataset entry persists on data.ca.gov from the comment period — Phase 3 implementation must confirm it is pulling the **final**, non-draft dataset ID, not the superseded draft.
- **Native geography:** Census tract, 2020 census geography per the 5.0 update (a change from 4.0's tract vintage).
- **Key required:** No.
- **License/terms:** Public, `data.ca.gov` open-data terms.
- **Limitations:** 5.0 adds two new indicators (Diabetes Prevalence, Small Air Toxic Sites) and changes underlying methodology/geography vintage relative to 4.0 — **scores are not directly comparable across versions**; must be labeled with methodology version explicitly, and cannot be trended against 4.0-era results without a documented crosswalk.
- **Update cadence:** Periodic major revisions, roughly every 2–4 years (3.0 → 4.0 → 5.0).

---

## 8. HCAI Emergency Department data — ✅ verified

- **Publisher / landing page:** California Department of Health Care Access and Information (HCAI); `https://hcai.ca.gov/data/healthcare-utilization/emergency-department/`; also published on `https://data.chhs.ca.gov/dataset/hospital-emergency-department-encounters-by-facility`
- **Current vintage:** Annual series spans 2012–2024 (2024 is the latest available year).
- **Access method:** CSV bulk download is the primary format on `data.chhs.ca.gov` ("Encounters by Facility"). HCAI separately publishes XLSX/XLSM **Pivot Profile** and **County Frequencies by Patient County of Residence** products through its Report Center, and a distinct **Patient Origin/Market Share Pivot Table** product (see §10) — these are genuinely separate files, not one combined file, and must be modeled as separate source adapters.
- **Native geography:** Facility-level and patient ZIP/county-of-residence level. No tract-level ED product is published directly by HCAI.
- **Key required:** No.
- **License/terms:** CHHS metadata lists "No License Provided," but usage is governed by the Office of the Patient Advocate (OPA) data-use framework: **no modification of the data, and commercial use requires approval.** This is a stricter tier than the facility-attributes CC-BY license (§9) and must be recorded distinctly in `DATA_MANIFEST.json` per source, not assumed uniform across HCAI products.
- **Limitations:** Aggregated quarterly-to-annual for confidentiality; exact small-cell suppression thresholds are not stated on the landing page and must be pulled from the HCAI technical/data-dictionary documentation during Phase 3 implementation.
- **Update cadence:** Annual release; individual facility submissions are quarterly, with summary reports published within ~14 days of DHCS/HCAI approval.

---

## 9. HCAI licensed healthcare facility data — ✅ verified

- **Publisher / landing page:** HCAI; `https://hcai.ca.gov/facility-finder/` (interactive search tool, not a bulk endpoint) and `https://hcai.ca.gov/data/data-resources/healthcare-facility-attributes/`; bulk dataset at `https://data.ca.gov/dataset/facility-profile-attributes`
- **Current vintage:** Rolling/continuously updated — not a fixed annual vintage.
- **Access method:** Bulk CSV/ZIP download from `data.ca.gov` ("Facility Profile Attributes"). A richer option exists via the HCAI ArcGIS Open Data hub (`https://opendata-hcai.hub.arcgis.com/`), offering CSV/KML/Zip/GeoJSON/GeoTIFF/PNG exports plus a GeoServices/WMS/WFS REST API — this is the closest thing to a true API for this source.
- **Native geography:** Facility point-level (address + coordinates, to be confirmed present in the CSV header at implementation time — not independently confirmed from metadata alone).
- **Key required:** No.
- **License/terms:** **Creative Commons Attribution (CC-BY)**, Open Definition certified per the data.ca.gov listing — more permissive than the ED-data OPA terms in §8; record separately in `DATA_MANIFEST.json`.
- **Limitations:** "Healthcare Facility Attributes" compiles data across multiple internal HCAI systems (licensing, financial, building safety) — attribute completeness varies by facility type and source system; deduplicate carefully against HRSA/CMS/NPPES per `docs/02` §5.2.
- **Update cadence:** Weekly (per data.ca.gov listing); seismic/construction-cost sub-datasets update roughly biweekly.

---

## 10. HCAI patient-origin / market-share data — ✅ verified, landing page corrected

- **Publisher / landing page:** HCAI Healthcare Analytics Branch. **Current landing page** (differs from what an older spec might assume): `https://hcai.ca.gov/data/healthcare-utilization/inpatient/`, product name **"Patient Origin/Market Share (Pivot Profile) — Inpatient, Emergency Department, and Ambulatory Surgery."** Also cataloged at `https://data.chhs.ca.gov/dataset/patient-origin-market-share-pivot-profile-inpatient-emergency-department-and-ambulatory-surgery`. A related interactive visualization exists separately at `https://hcai.ca.gov/visualizations/facility-market-share-and-patient-origin/`.
- **Current vintage:** 2024 is the most recent year.
- **Access method:** XLSX Excel pivot tables only — no CSV, no API.
- **Native geography:** Patient ZIP code of origin, aggregated to destination facility (Patient Origin view) or to destination-facility market share (Market Share view).
- **Key required:** No.
- **License/terms:** Same OPA framework as §8 — no modification, commercial use requires approval.
- **Limitations:** **Physician-owned ambulatory-surgery clinics do not report to HCAI and are excluded** — ambulatory-surgery market-share totals are incomplete by design and must carry a UI disclosure, not just a technical footnote.
- **Update cadence:** Annual.

---

## 11. HRSA health center service-delivery sites — ✅ verified

- **Publisher / landing page:** HRSA Bureau of Primary Health Care via `data.hrsa.gov`; landing at `data.hrsa.gov/topics/service-delivery-sites`, download page `data.hrsa.gov/data/download`.
- **Current vintage:** Live/rolling — confirmed last-updated 2026-07-07, approximately 16,200+ sites nationally.
- **Access method:** Direct CSV — `data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv` — plus an accompanying XLSX metadata/data-dictionary file. A filterable dashboard is also exportable to CSV/Excel.
- **Native geography:** Point-level (site address/coordinates).
- **Key required:** No.
- **License/terms:** Public federal data, no restrictions noted.
- **Limitations:** Mobile-van indicator and detailed service-taxonomy fields are documented in the metadata file — must be confirmed against the actual XLSX schema before building the adapter's field mapping, not assumed from the landing page alone.
- **Update cadence:** Daily.

---

## 12. HRSA HPSA and MUA/MUP shortage-area designations — ✅ verified

- **Publisher / landing page:** HRSA Bureau of Health Workforce; `data.hrsa.gov/topics/health-workforce/shortage-areas`
- **Current vintage:** All four dataset families (HPSA Primary Care, HPSA Dental, HPSA Mental Health, MUA/P) show a last-updated date of 2026-07-11 (the day of this verification) — effectively real-time rolling designation.
- **Access method:** `data.hrsa.gov/data/download?titleFilter=Shortage+Areas` — batch downloads in XLSX, CSV, KML, and SHP per designation type. A separate "Find Shortage Areas by Address" tool exists for single-address lookups but is not suited to bulk pulls; no formal public bulk REST API was found.
- **Native geography:** Sub-county polygons/points — HPSA designation areas, facility-specific HPSAs, and MUA/P service areas.
- **Key required:** No.
- **License/terms:** Public federal data.
- **Limitations:** No API — batch download only, meaning refresh must be scheduled rather than queried on demand; designation types carry a score and status that must not be reduced to a binary flag (per `docs/02` §5.4).
- **Update cadence:** Daily refresh cycle upstream; adapter refresh scheduled per `config/freshness.yml` (weekly is reasonable given no per-tract urgency).

---

## 13. VTA static GTFS feed — ✅ verified live

- **Publisher / landing page:** Santa Clara Valley Transportation Authority; portal `https://www.vta.org/open-data-portal`, ArcGIS-based "SCVTA Open Data Site" at `data.vta.org`, GTFS-specific host `gtfs.vta.org`.
- **Current vintage:** Confirmed live as of April 2026 per the Mobility Database (72 routes); direct fetch during this verification pass succeeded.
- **Access method:** `https://gtfs.vta.org/gtfs_vta.zip` — **confirmed to resolve**, returning a valid 4.8 MB `application/zip` GTFS package containing `agency.txt`, `calendar.txt`, `calendar_dates.txt`, `routes.txt`, `shapes.txt`, `stops.txt`, `stop_times.txt`, `trips.txt`. Also mirrored on Transitland (`transit.land/feeds/f-9q9-vta`) and the Mobility Database (`mdb-57`) as aggregator mirrors with version history — useful as a secondary fallback if the direct feed is temporarily unavailable.
- **Native geography:** Route/stop-level, VTA service area (Santa Clara County).
- **Key required:** No.
- **License/terms:** Open for developer use per VTA's stated policy goal; no formal license text located on the feed page itself — confirm exact attribution wording before publishing derived transit-access metrics.
- **Limitations:** No GTFS-realtime (vehicle positions/trip updates) feed was confirmed during this pass — static schedule only. This means transit-access analysis reflects *scheduled* service, not live conditions; must be labeled accordingly. Follow-up check for a realtime feed is scheduled for Phase 3/6 implementation.
- **Update cadence:** Not explicitly stated by VTA; aggregator version history implies periodic (not guaranteed daily) updates. Adapter should checksum on each fetch and only reprocess on change.

---

## 14. Santa Clara County GIS Hub / open data — ⚠️ partially confirmed

- **Publisher / landing page:** County of Santa Clara Technology Services & Solutions / GIS. The documented landing pages `gis.santaclaracounty.gov/access-countywide-gis-map-data` and `data.sccgov.org` both returned HTTP 403 to automated fetch during this verification pass — most likely bot-blocking rather than an actual outage, but not yet confirmed via a real browser session.
- **Current vintage:** Not independently confirmed this pass due to the fetch block; a manual browser check is scheduled for Phase 3.
- **Access method:** The actual underlying data platform was located and confirmed reachable at **`prod-sccgov.opendata.arcgis.com`** (ArcGIS Hub), with downloads in CSV, KML, Zip, GeoJSON, GeoTIFF, PNG, and a REST API (GeoServices/WMS/WFS). An underlying REST endpoint was also found at `webgis.sccgov.org/gis/rest/services/opendata/SCCGISHUBFeatureService` (MapServer/FeatureServer). A "County Supervisor Districts" dataset was confirmed discoverable via search.
- **Native geography:** Countywide, mixed layer types (parcels, districts, facilities).
- **Key required:** No for public layers.
- **License/terms:** Standard ArcGIS Hub open-data license (attribution typically expected); not independently confirmed for this specific hub instance.
- **Limitations:** Two portal names/aliases appeared in search (`prod-sccgov.opendata.arcgis.com` vs. an older `opendata-sccgis.opendata.arcgis.com`) — must be reconciled to a single canonical source during Phase 3, and public facility layers (community centers, libraries) beyond supervisor districts have not yet been individually confirmed.
- **Update cadence:** Not confirmed this pass.
- **Follow-up required:** Manual browser-based confirmation of the landing pages and canonical hub URL before the Phase 3 adapter is finalized.

---

## 15. USDA SNAP retailer locator — ⚠️ rebrand in progress

- **Publisher / landing page:** **USDA Food and Nutrition Service (FNS) was renamed the Food and Nutrition Administration (FNA)** effective June 1, 2026. The canonical domain is migrating to `fna.usda.gov` (e.g., `fna.usda.gov/snap/retailer-locator`); the legacy `fns.usda.gov/snap/retailer-locator/data` URL may still resolve via redirect during the transition but should not be hardcoded as final.
- **Current vintage:** Historical bulk file current through December 31, 2025.
- **Access method:** CSV bulk download (store name, type, address, lat/long, authorization dates, ~20 years of history). Also mirrored on an ArcGIS Hub (`usda-snap-retailers-usda-fns.hub.arcgis.com`) with CSV/KML/GeoJSON export and a web map viewer — the ArcGIS mirror URL itself still bears the old "usda-fns" branding as of this verification and should be treated as a secondary/fallback path.
- **Native geography:** Point-level (individual retailer locations).
- **Key required:** No.
- **License/terms:** Public federal data.
- **Limitations:** URL/branding transition means links found in older documentation may break during this build; the final resolved URL must be pinned and verified again immediately before Phase 3 implementation, not merely at this Phase 0 check. SNAP authorization is not a proxy for healthy-food quality (per `docs/02` §6.3).
- **Update cadence:** Historical file appears to be an annual/periodic snapshot; the live locator likely updates more frequently, but exact cadence is not stated.

---

## 16. Santa Clara County public meetings portal — ⚠️ platform changed

- **Publisher / landing page:** Clerk of the Board of Supervisors. The documented URL `santaclaracounty.gov/access-agendas-minutes-videos-public-meetings-1997-present` returned HTTP 403 to automated fetch (likely bot-blocking; the page is indexed and otherwise appears current) — the **actual live portal was located and confirmed reachable at `sccgov.iqm2.com`** (IQM2/Granicus "OnDemand" meeting portal).
- **Current vintage:** Live, ongoing — meetings currently scheduled into August 2026 were visible during verification.
- **Platform change — important:** The County migrated off the legacy **MinuteTraq** system to **Granicus** (branded as the IQM2/"OnDemand" portal; support contact confirmed as `support@granicus.com`) for Board of Supervisors meetings starting **January 22, 2024**. **This is not Legistar** — Legistar is used by the City of Santa Clara, a separate jurisdiction, and must not be conflated with the County's system when building document connectors.
- **Confirmed:** Both the **Health Advisory Commission** and the **Board of Supervisors** publish through the same `sccgov.iqm2.com` Granicus portal — directly verified (HAC showed a cancelled July 15, 2026 meeting; Board of Supervisors showed a regular meeting August 11, 2026).
- **Access method:** Granicus/IQM2 portals expose agendas/minutes primarily as browsable-calendar PDFs. IQM2 has a documented (if semi-informal) API/RSS pattern used by civic-tech scrapers — treated as a candidate for a dedicated scraping-feasibility spike in Phase 8, not assumed reliable at Phase 0. Per `docs/02_DATA_SOURCE_REGISTRY.md` §8.1, **user upload is the first-class, always-available path**; any scraper/connector is a secondary enhancement built only if stable.
- **Native geography:** N/A (document metadata: meeting body, date, agenda item, page).
- **Key required:** No for browsing; no public API key scheme found.
- **License/terms:** Public meeting records; no special terms found.
- **Limitations:** The county.gov landing page itself could not be fetched directly (403) to confirm it still forwards to IQM2 rather than a newer system — a manual/browser-based check is scheduled before Phase 8 connector work begins.
- **Update cadence:** Live/ongoing.

---

## 17. Census Bureau 2020 Mean Center of Population (block group) — ✅ verified live (Phase 6)

- **Publisher / landing page:** U.S. Census Bureau; `https://www.census.gov/geographies/reference-files/time-series/geo/centers-population.html`.
- **Current vintage:** 2020 Census, released 2021-08-12.
- **Access method:** `https://www2.census.gov/geo/docs/reference/cenpop2020/blkgrp/CenPop2020_Mean_BG06.txt` (California, statewide, filtered to Santa Clara County FIPS `06085` at normalize time) — confirmed live: a 1.1MB keyless CSV, no bulk-file registration or key required.
- **Native geography:** Block group (population-weighted mean center point per block group).
- **Key required:** No.
- **License/terms:** Public domain (U.S. government work).
- **Limitations:** A small number of block groups report zero or near-zero population (expected for non-residential/industrial areas) — retained and audited, not silently dropped. This file is the Bureau's own pre-computed population-weighted point; no further weighting computation is performed on it (DEC-044).
- **Update cadence:** Fixed vintage (tied to the decennial census), not a recurring refresh.

---

## 18. Santa Clara County Public Health Department "Health clinics" layer — ✅ verified live (Phase 6)

- **Publisher / landing page:** Santa Clara County Public Health Department; `https://data-sccphd.opendata.arcgis.com/datasets/sccphd::health-clinics`.
- **Current vintage:** Rolling/continuous (ArcGIS Hub live layer, not a dated snapshot).
- **Access method:** ArcGIS FeatureServer, `https://services2.arcgis.com/RiZWfy7B1r76pKTz/arcgis/rest/services/Health_clinics/FeatureServer/0` — confirmed live: 99 real records (e.g. AACI, Gardner Family Health Network, Bay Area Community Health), fields `OBJECTID`, `USER_H_CenterName`, `USER_OperatedBy`, `Status`, `Match_addr`, point geometry.
- **Native geography:** Point-level (individual clinic locations).
- **Key required:** No.
- **License/terms:** County of Santa Clara ArcGIS Hub open-data terms.
- **Limitations:** One of very few real, currently-reachable facility inventories found directly on the County's own ArcGIS Hub catalogs during Phase 6 discovery — used as a supplemental clinical-care source alongside HCAI/HRSA, not a replacement for either. Direct `sccgov.org`-hosted GIS REST services (a separate, non-Hub domain) returned HTTP 403 to every automated fetch attempt and were not usable this session (DEC-045).
- **Update cadence:** Not explicitly stated; treated as rolling/continuous per the Hub's own layer description.

---

## 19. OpenStreetMap road/path network (via Overpass API, OSMnx) — ✅ verified live (Phase 6)

- **Publisher / landing page:** OpenStreetMap contributors; `https://www.openstreetmap.org/copyright`. Accessed via the Overpass API through the `osmnx` Python library, not a direct planet-file download.
- **Current vintage:** Live extract at time of fetch (not a fixed dataset vintage) — OSM is continuously edited; the extract used is a snapshot, checksummed and cached (`data/raw/osm_network/`), not re-fetched on every pipeline run.
- **Access method:** `osmnx.graph_from_place("Santa Clara County, California, USA", network_type=...)` for both `walk` and `drive` network types — confirmed live: drive network 45,836 nodes/109,872 edges (38-148s), walk network 277,444 nodes/788,154 edges (171-194s). Cached as GraphML with a sha256 checksum and a `DATA_MANIFEST.json` entry (`source_id=osm_overpass_network`).
- **Native geography:** Road/path network graph (not tract-aligned; nodes are individual intersections/path points).
- **Key required:** No.
- **License/terms:** Open Database License (ODbL) 1.0.
- **Limitations:** A crowd-sourced dataset — coverage and attribute completeness (e.g. `maxspeed` tags used for drive-mode speed imputation) vary by area and are not independently verified per-edge. The walk network's edge speeds are NOT taken from OSM tags (see `docs/methods/routing.md` for the real speed-imputation bug this caused and how it was fixed) — a constant 5 km/h is assigned instead.
- **Update cadence:** Not applicable in the traditional sense (continuously edited upstream); this platform re-fetches only when the cached graph is explicitly deleted, per `run_build_network_graphs.py`'s cache-first design.

---

## Summary of material changes vs. what an older or generic spec might assume

1. **Census API now mandates a key for every call** (not just high-volume) — the no-key mode must route through `data.census.gov` bulk downloads by default, matching the spec's own documented fallback ordering.
2. **HUD USPS ZIP crosswalk now requires free registration** — the platform defaults to the keyless Census ZCTA-to-tract relationship file, exactly as the spec's own fallback anticipated, with HUD promoted from "primary" to "optional enhancement."
3. **CalEnviroScreen 5.0 finalized July 1, 2026**, ten days before this build started — implementation must target the final dataset, not the stale draft-5.0 entry that persists on data.ca.gov.
4. **USDA FNS renamed to FNA** (June 1, 2026) — domain migration in progress; pin the final resolved URL at Phase 3 implementation, not at Phase 0.
5. **Santa Clara County's meeting portal runs on Granicus/IQM2**, not Legistar or the legacy MinuteTraq system — document connectors in Phase 8 must target the correct platform.
6. **HCAI publishes at least three distinct product families** (ED encounters, facility attributes, patient-origin/market-share) under **two different license tiers** (OPA-restricted vs. CC-BY) — these must never be merged into a single manifest entry or a single license assumption.
7. Two sources (**Santa Clara County GIS Hub** and the **county meeting-portal landing page**) returned HTTP 403 to automated fetch during this pass and need a manual browser-based re-confirmation before their Phase 3/8 adapters are finalized — flagged, not blocking, since working underlying endpoints were independently located for both.
8. **Phase 6 added three new sources** (items 17-19): the Census Bureau's own pre-computed 2020 Mean Center of Population file (block group), avoiding a self-computed population-weighting step; the SCC Public Health Department's "Health clinics" ArcGIS layer, the one real facility inventory found directly reachable on the County's ArcGIS Hub catalogs (the direct `sccgov.org`-hosted GIS REST services remained 403-blocked, same as Phase 3); and live OpenStreetMap network extracts via Overpass/OSMnx for real walking/driving routing, checksummed and cached rather than re-fetched per run.
