# 06 — Acceptance Tests and Definition of Done

## 1. Principle

The application is not complete because it looks polished or because a pipeline prints “passed.” Completion requires evidence that the data, methods, interface, exports, and operational workflow meet the requirements below.

Claude must create automated checks where possible and document manual checks in `DELIVERY_REPORT.md`.

## 2. Fresh-clone acceptance

From a clean clone on Apple Silicon macOS:

```bash
make bootstrap
make demo
make dev
```

must start a working application without manual source edits.

Then:

```bash
make test
make audit
make export-demo
```

must succeed.

`make data` must either:

- complete using live official sources; or
- fail only for clearly identified unavailable mandatory sources while preserving last-known-good caches and not producing misleading outputs.

## 3. Repository acceptance

Required:

- Git repository initialized;
- clean `.gitignore`;
- no secrets;
- no absolute user paths;
- pinned dependencies and lockfiles;
- README with exact setup;
- license recommendation/documentation;
- source code separated from generated data;
- `CLAUDE.md`, plan/state/decision artifacts, data dictionary, model card, and delivery report present;
- no copied code or assets from the old repository;
- no unexplained binary blobs.

## 4. Data-source acceptance

For each required source:

- official landing page verified;
- current resource discovered;
- download content type validated;
- retrieval timestamp and checksum recorded;
- schema validated;
- row count recorded;
- native geography recorded;
- update cadence and freshness threshold recorded;
- license/terms recorded;
- last-known-good cache behavior tested;
- source failure state visible in UI;
- fixture-based test available.

The data catalog must show source status and vintage.

## 5. Geographic integrity acceptance

Required tests:

- all canonical tract IDs are strings of length 11;
- county prefix is `06085`;
- duplicate tract GEOIDs equal zero;
- canonical tract geometry count matches the selected official boundary vintage;
- tract-to-health and tract-to-ACS joins cover at least 99% of eligible tracts unless an official source excludes a tract;
- excluded geographies are listed with reason;
- no leading-zero loss across CSV/Parquet/JSON/API boundaries;
- geometries valid after repair;
- map and warehouse GEOID sets match;
- ZIP/ZCTA crosswalk weights pass sum checks;
- allocated HCAI results retain native geography and method fields;
- city/district aggregates use denominators, not simple percentage averages.

## 6. Metric integrity acceptance

For every displayed metric:

- metric registry entry exists;
- label, unit, direction, source, vintage, and definition exist;
- raw value available or visibly unavailable;
- percentile comparison group documented;
- uncertainty retained when source provides it;
- percentage values remain within logical bounds;
- counts are nonnegative;
- no all-null production metric column;
- no silent median/zero imputation;
- stale or crosswalked values are labeled;
- display rounding does not alter stored values.

## 7. Score acceptance

For every domain/scenario score:

- formula is configuration-driven;
- component coverage threshold enforced;
- score range is 0–100;
- higher direction is documented;
- component contributions sum to the score within tolerance;
- raw values and percentiles are available;
- missing components are listed;
- uncertainty interval exists where configured;
- weight-sensitivity result exists;
- scenario configuration hash exists;
- score is not described as a probability or observed prevalence;
- explanation is understandable to a nontechnical user.

## 8. Uncertainty acceptance

Required:

- ACS margins of error stored;
- PLACES confidence intervals stored;
- standard-error conversion tested;
- Monte Carlo procedure deterministic with seed;
- score/rank intervals generated for configured scenarios;
- top-decile probability generated;
- low-precision estimates visibly flagged;
- a test confirms 100% prevalence bounds are respected;
- uncertainty is shown in UI and exports;
- no unsupported precision such as six-decimal public scores.

## 9. Sensitivity acceptance

Required:

- balanced, need-first, access-first, resource-first, and utilization-first presets;
- random-weight analysis with documented distribution and seed;
- rank-stability summary;
- UI warning for assumption-sensitive results;
- comparison of at least two saved scenarios;
- no use of sensitivity probability as intervention-success probability.

## 10. Resource and access acceptance

Required:

- nonzero official clinical-care/health-center/facility sources;
- nonzero transit stops from current VTA GTFS;
- resource categories and source tiers visible;
- duplicate facility audit;
- population-weighted or explicitly labeled centroid origins;
- nearest-distance outputs non-null for eligible tracts;
- counts/catchments non-null;
- straight-line and network methods never conflated;
- routing method, date, and assumptions visible;
- unreachable resources handled;
- resource-gap score decomposable;
- E2SFCA outputs only when capacity assumptions are documented;
- mobile-site optimizer produces solver status, objective, selected sites, reach, overlap, and alternatives;
- optimizer output labeled scenario rather than forecast.

## 11. HCAI/utilization acceptance

Required:

- current official HCAI metadata queried;
- selected annual files documented;
- XLSX/XLSM parsing covered by tests;
- payer, disposition, facility, language, and patient-origin data normalized when present;
- masked/suppressed values retained as such;
- native county/facility/ZIP results available;
- allocated tract estimates labeled;
- rates use valid denominators;
- year-to-year comparability notes;
- patient-flow definitions explicit;
- no patient-level inference;
- at least one independent validation check using HCAI or another external outcome, or a clear “insufficient data” result with next step.

## 12. Validation acceptance

No validation result may be tautological.

Automated test should flag validation where outcome metric is also a score component.

Each validation record includes:

- hypothesis;
- score/model;
- independent outcome;
- sample and geography;
- method;
- result and uncertainty;
- spatial check;
- limitation;
- interpretation status.

Negative/inconclusive results must remain visible.

## 13. Frontend functional acceptance

### Overview

- task cards work;
- search works;
- freshness visible;
- county snapshot links to evidence;
- saved workspace opens.

### Explore

- map loads without console error;
- tract hover/click works;
- search selects geography;
- layer/legend update correctly;
- raw value, percentile, source, period, and uncertainty visible;
- compare mode works;
- table alternative works;
- shareable URL restores state.

### Prioritize

- scenario wizard completes;
- default and advanced weights visible;
- filters work;
- ranking map/table synchronize;
- explanation and stability visible;
- scenario comparison works;
- export works.

### Access Lab

- resource filters work;
- source tier visible;
- proximity/catchment mode works;
- travel method visible;
- optimizer runs on a small scenario;
- output maps and tables agree.

### Utilization Lab

- year, payer, language, diagnosis, facility, and geography filters work where data exists;
- native geography warning visible;
- flow table works;
- allocated estimates visually distinct.

### Validate

- source status visible;
- data-quality checks visible;
- score method explorable;
- independent validation visible;
- limitations visible.

### Advocate

- brief builder works;
- every numeric claim has evidence;
- PDF/Markdown/CSV export works;
- scenario hash/source appendix included;
- print layout has no clipping.

### Copilot

- no-key guided mode works;
- optional LLM mode works when configured;
- numeric answers use tools;
- citations work;
- document upload/search/delete works;
- prompt-injection test passes;
- “show on map” and “create brief” actions work.

### Data

- catalog searchable;
- source details accurate;
- data dictionary downloadable;
- processed exports available;
- status/freshness visible.

## 14. UX acceptance

Test with at least these personas:

- nontechnical commissioner;
- analyst;
- community advocate;
- first-time public user.

Success criteria:

- first-time user can identify a priority geography in under three minutes;
- first-time user can explain top drivers without opening methods;
- first-time user can create a brief in under five minutes;
- no required workflow begins with a blank technical configuration screen;
- no page has more than one primary call to action at a time;
- no dense wall of ungrouped cards;
- critical labels are plain language;
- every error gives a recovery step;
- loading and empty states are designed;
- mobile workflow remains usable;
- user always sees geography/lens/period.

Claude must create `UX_REVIEW.md` with screenshots and findings.

## 15. Accessibility acceptance

Automated:

- axe tests on all primary pages;
- no serious/critical violations;
- color contrast tested;
- landmarks and labels tested.

Manual:

- keyboard-only navigation;
- visible focus;
- map controls operable or equivalent table path;
- screen-reader labels for charts/map controls;
- reduced motion;
- zoom to 200%;
- mobile viewport;
- accessible export structure.

## 16. Visual quality acceptance

Required visual review at desktop and mobile widths:

- no overflow/clipping;
- consistent spacing/typography;
- map legend readable;
- drawers and dialogs fit viewport;
- selected state obvious;
- no placeholder icons/text;
- charts legible and labeled;
- print/PDF pages balanced;
- source/caveat text readable;
- design looks custom and coherent rather than default component-library output.

Use visual regression screenshots for key pages.

## 17. Performance acceptance

Measure, do not guess.

Targets after warm local load:

- page shell interactive within target budget;
- map interaction smooth;
- profile query under target latency;
- scenario evaluation under target latency;
- no excessive client bundle;
- no raw multi-megabyte dataset fetched unnecessarily;
- no repeated source download on every request;
- reports complete within documented time.

Record measurements in delivery report.

## 18. Security acceptance

- secrets not committed;
- API keys absent from client bundle;
- uploads size/type restricted;
- HTML/Markdown sanitized;
- document content cannot override instructions;
- analytics DB read-only for requests;
- SQL allowlist/validation tests;
- rate limits for expensive endpoints;
- no PHI required;
- delete-upload function verified;
- logs do not include file contents by default;
- dependency audit reviewed;
- CSP and CORS configured.

## 19. Copilot evaluation acceptance

Golden test set contains at least 50 cases.

Thresholds must be defined for:

- numeric exactness;
- citation correctness;
- unsupported-claim rate;
- geography correctness;
- tool-selection correctness;
- refusal/clarification behavior;
- prompt-injection resistance.

Zero tolerance for fabricated citations in release candidate tests.

## 20. Export acceptance

Generate and inspect:

- tract profile PDF;
- supervisor-district profile;
- scenario brief;
- HAC meeting-preparation packet;
- data appendix CSV;
- evidence packet;
- Markdown version.

Each contains:

- title/purpose;
- date;
- geography;
- data vintages;
- key evidence;
- uncertainty;
- methods note;
- source list;
- limitations;
- reproducibility ID.

## 21. Failure-mode acceptance

Simulate:

- CDC source timeout;
- Census missing/invalid key;
- HCAI schema change;
- Overpass 429;
- GTFS unavailable;
- empty resource category;
- all-null source column;
- stale cache;
- malformed upload;
- unavailable LLM provider;
- map tile failure.

The app must remain understandable and never substitute fake values.

## 22. Final browser demo scenarios

Claude must perform and document:

### Scenario A — Diabetes prevention

Find stable top areas, explain drivers, compare resource access, show independent evidence, export a brief.

### Scenario B — Mobile care

Select a district, apply transit/no-vehicle constraints, run candidate-site optimization, compare two configurations, export assumptions.

### Scenario C — Language access

Identify language-access priorities, inspect preferred-language utilization context, generate staff questions with caveats.

### Scenario D — Agenda intelligence

Upload a public HAC or Board packet, extract agenda items, link a health item to data, generate a meeting-preparation packet.

### Scenario E — Public transparency

Open the data catalog and model card, reproduce a score, inspect source freshness and limitation.

## 23. Final delivery report

`DELIVERY_REPORT.md` must include:

- architecture summary;
- exact setup commands;
- current source status;
- data build results;
- analytical method summary;
- validation results;
- test results;
- accessibility results;
- performance results;
- screenshots;
- known limitations;
- unresolved risks;
- deployment instructions;
- demo script;
- a table mapping every acceptance criterion to evidence.

## 24. Completion rule

Claude must not say “done” while any release-blocking criterion is missing. If a criterion cannot be met because a source or credential is unavailable, document the blocker, build the correct unavailable state, and clearly separate completed work from deferred work.
