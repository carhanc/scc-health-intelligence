# 07 — Build Phases, Gates, and Autonomous Execution Protocol

## Purpose

This document defines the order in which Santa Clara Health Intelligence must be built. It prevents the project from becoming a visually impressive shell with weak data, a collection of disconnected experiments, or a half-finished scaffold.

Claude Code must execute the phases below in order. A phase is complete only when its gate passes and evidence is recorded in `TASKS.md`, `STATE.md`, and the relevant test or audit output. A green application startup is not sufficient evidence.

## Operating protocol for every phase

For each phase:

1. **Re-read the relevant specification sections.**
2. **Inspect current repository state and tests.** Do not assume previous work is correct.
3. **Write or update a phase plan** in `TASKS.md`, including dependencies, risks, and acceptance evidence.
4. **Implement the smallest complete vertical slice**, not disconnected placeholder components.
5. **Add unit and integration tests while implementing.**
6. **Run the phase-specific test and audit commands.**
7. **Start the app and visually inspect affected workflows** in the Claude Desktop browser pane.
8. **Fix defects found through visual inspection.**
9. **Update `DECISIONS.md`, `RISK_REGISTER.md`, `DATA_DICTIONARY.md`, `DATA_MANIFEST.json`, and `MODEL_CARD.md` as relevant.**
10. **Commit a coherent checkpoint** with a descriptive message.
11. **Update `STATE.md`** with the exact resume point and remaining work.

Do not proceed when a release gate is red. Resolve the defect, formally narrow the scope, or mark the capability unavailable with a truthful user-facing state and a documented decision.

---

# Phase 0 — Clean-room discovery, source verification, and architecture approval

## Goal

Convert this build pack into an implementation plan grounded in current official data sources and a coherent system architecture.

## Required work

### Read all specifications

Read, in order:

- `CLAUDE.md`
- `docs/00_PRODUCT_CHARTER.md`
- `docs/01_UX_UI_SPEC.md`
- `docs/02_DATA_SOURCE_REGISTRY.md`
- `docs/03_ANALYTICS_METHODS.md`
- `docs/04_ARCHITECTURE_IMPLEMENTATION.md`
- `docs/05_AI_COPILOT.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- this document
- `docs/08_CONTENT_REPORTING.md`
- `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`

### Enforce the clean-room boundary

- Confirm the current project root.
- Do not list, inspect, or read any sibling repository.
- Add a clean-room declaration to `PLAN.md`.
- Add tests or configuration that prevent scripts from resolving paths outside the project root except approved cache locations.

### Verify sources before coding

For every Tier 1 and Tier 2 source in the source registry:

- open the official landing page or API documentation;
- verify the most recent published vintage;
- verify download/API access method;
- verify geography and field availability;
- identify license and attribution requirements;
- record retrieval strategy and fallback;
- record known suppression, confidence interval, or margin-of-error behavior;
- record whether the source is tract, ZIP/ZCTA, county, facility, point, route, or document level.

Do not hard-code a year until verification is complete. Prefer a “latest verified vintage” configuration with an explicit pinned vintage in generated manifests.

### Produce planning artifacts

Create:

- `PLAN.md`
- `TASKS.md`
- `STATE.md`
- `DECISIONS.md`
- `RISK_REGISTER.md`
- `docs/architecture/system-context.mmd`
- `docs/architecture/data-flow.mmd`
- `docs/architecture/deployment.mmd`
- `docs/design/information-architecture.md`
- `docs/design/user-flows.md`
- `docs/data/source-verification.md`

`PLAN.md` must include:

- final stack and version strategy;
- monorepo structure;
- local and deployment architecture;
- data ingestion and provenance design;
- deterministic and optional AI modes;
- database and cache design;
- page and route inventory;
- test strategy;
- accessibility strategy;
- release phases and estimated risk, not calendar promises;
- optional credentials and keyless fallbacks;
- exact top-level commands to be implemented.

## Gate 0

Phase 0 passes only when:

- every required document has been read;
- the old repository was not inspected;
- all critical source assumptions are verified against official pages;
- `PLAN.md` resolves architectural ambiguities;
- `TASKS.md` maps every acceptance criterion to a phase;
- risks include data drift, geography mismatch, source outage, privacy, uncertainty, AI hallucination, and misleading interpretation;
- the user has approved the plan.

---

# Phase 1 — Repository foundation and reproducible developer experience

## Goal

Create a production-grade monorepo that can be bootstrapped on Apple Silicon macOS without manual patching.

## Required structure

Use this structure unless an approved ADR improves it:

```text
scc-health-intelligence/
  apps/
    web/
    api/
  packages/
    ui/
    schemas/
    config/
  pipelines/
    sources/
    transforms/
    geography/
    analytics/
    validation/
    exports/
  data/
    raw/
    staged/
    curated/
    demo/
  warehouse/
  tests/
    unit/
    integration/
    e2e/
    accessibility/
    data/
  scripts/
  docs/
  .github/workflows/
  Makefile
```

### Tooling

Implement:

- Node 22 version pin;
- pnpm via Corepack;
- Python 3.12 via `uv`;
- strict TypeScript;
- Ruff and type checking;
- ESLint and Prettier;
- pytest, Vitest, Playwright, and axe;
- pre-commit or equivalent local checks;
- `.env.example` with no secrets;
- project-root path guards;
- deterministic random seeds;
- structured logging;
- error boundaries and health endpoints;
- GitHub Actions for lint, types, unit tests, data-contract smoke tests, build, and e2e smoke tests.

### Required commands

Create and test:

```bash
make bootstrap
make data
make demo
make dev
make test
make audit
make export-demo
```

`make bootstrap` must:

- verify architecture and supported macOS version;
- install or clearly guide installation of required project-local tooling;
- avoid modifying unrelated shell configuration without permission;
- create virtual environments and install dependencies;
- validate versions;
- copy `.env.example` to `.env.local` only if absent;
- run a smoke test.

### Minimal vertical slice

Create a frontend shell, API health route, DuckDB connectivity check, and one typed API request. Do not build final visual components yet.

## Gate 1

- Fresh-clone bootstrap succeeds on Apple Silicon.
- All lockfiles are committed.
- `make dev` starts web and API together.
- Health checks pass.
- Linters and type checks pass.
- No secrets or absolute user paths exist.
- CI runs successfully.
- `STATE.md` contains exact next steps.

---

# Phase 2 — Geography spine, provenance system, and data contracts

## Goal

Build the canonical geographic and provenance foundation before adding metrics.

## Required work

### Canonical geographies

Create versioned canonical dimensions for:

- census tracts;
- block groups if needed for source harmonization;
- ZIP codes and ZCTAs;
- cities/places;
- county supervisor districts;
- state and federal legislative districts when available;
- service planning areas or county-defined regions when available;
- facility and resource points;
- transit stops/routes.

All IDs must be strings. Preserve leading zeros. Every geography table must contain vintage, source, and geometry CRS metadata.

### Crosswalks

Implement explicit, tested crosswalks:

- ZIP to tract using the verified HUD USPS crosswalk;
- ZCTA to tract where necessary;
- tract vintage conversion where source vintages differ;
- point-to-tract spatial joins;
- district overlay population weighting where a clean one-to-one relationship does not exist.

Never join ZIP, ZCTA, and tract by string similarity.

### Provenance

Create a source adapter interface that records:

- source ID;
- official landing page;
- exact download/API URL;
- source vintage;
- retrieval timestamp;
- HTTP metadata when available;
- checksum;
- file size and row count;
- schema fingerprint;
- license/attribution;
- parser version;
- transformation lineage;
- warnings and suppression notes.

Persist these in `DATA_MANIFEST.json` and warehouse provenance tables.

### Data contracts

Use a validation framework such as Pandera, Pydantic, or Great Expectations. Contracts must check:

- field presence and type;
- geography ID format;
- row uniqueness;
- valid units/ranges;
- denominator positivity;
- source vintage;
- non-null expectations;
- duplicated facilities or stops;
- impossible coordinates;
- unexpected schema drift.

### Demo data

Create a deterministic demo snapshot from successfully retrieved public data. Do not fabricate values. The demo dataset must include source/vintage labels and be clearly marked as a cached snapshot.

## Gate 2

- Geometry count and coverage audits pass.
- Every tract has a canonical 11-digit GEOID.
- Crosswalk weights sum within documented tolerances.
- Point layers fall within or near Santa Clara County as expected.
- Provenance is queryable and visible in a developer data explorer.
- Source failures produce structured unavailable states rather than empty all-null tables.
- Demo snapshot can run offline.

---

# Phase 3 — Core federal, state, and local data ingestion

## Goal

Ingest, validate, and harmonize the core public-health and social-context sources.

## Required source adapters

At minimum implement verified adapters for:

- CDC PLACES;
- ACS 5-year estimates and margins of error;
- CDC/ATSDR SVI;
- California Healthy Places Index;
- CalEnviroScreen;
- HCAI facility inventory and attributes;
- HCAI emergency-department products;
- HRSA health centers and shortage designations;
- Santa Clara County GIS resources;
- VTA GTFS;
- HUD USPS ZIP–tract crosswalk;
- USDA SNAP retailer/resource data where permitted and useful;
- public hospital/clinic/provider resources from official inventories;
- county agendas, minutes, and staff reports through official portals.

### Source adapter requirements

Each adapter must:

- have a source-specific schema test;
- use raw immutable caching;
- implement retry with bounded backoff;
- implement a verified fallback only where allowed;
- distinguish transient failure from source retirement;
- surface outdated vintages;
- never silently substitute a materially different source;
- include a small fixture for tests;
- output normalized Parquet/GeoParquet.

### Data explorer

Create an internal developer-only page or CLI that shows:

- source status;
- latest successful retrieval;
- expected and actual row counts;
- schema changes;
- freshness;
- warnings;
- missing geographies;
- checksums.

## Gate 3

- Core source adapters work against live or cached verified data.
- Every metric has unit, directionality, denominator, source, vintage, and uncertainty field when available.
- ACS margins of error are retained, not discarded.
- PLACES confidence intervals are retained.
- HCAI suppression/masking is preserved.
- Data explorer accurately reports source failures.
- No production metric is populated from mock data.

---

# Phase 4 — Analytics foundation, uncertainty, and explainability

## Goal

Build transparent, defensible analytics before exposing rankings in the UI.

## Required work

### Metric catalog

Create a machine-readable metric registry containing:

- canonical metric ID;
- display name;
- definition;
- source field;
- numerator/denominator;
- unit;
- favorable direction;
- geography;
- vintage;
- estimate and uncertainty fields;
- transformations;
- inclusion/exclusion in domains;
- caveats;
- citations.

### Domain scores

Implement the domains in the analytics specification, including:

- health burden;
- barriers and vulnerability;
- resource access;
- environmental/contextual burden;
- utilization pressure where independently available.

Do not create a single opaque “truth score.” Provide domain scores and a configurable priority lens.

### Uncertainty propagation

Implement:

- ACS MOE conversion to standard error;
- PLACES interval handling;
- Monte Carlo propagation with deterministic seeds;
- percentile and rank intervals;
- probability of being in a priority tier;
- missingness and reliability labels;
- uncertainty-aware comparisons.

### Sensitivity analysis

Implement:

- multiple named weight profiles;
- random or structured weight perturbation within defensible ranges;
- rank stability;
- top-decile inclusion frequency;
- score range;
- driver stability;
- a warning when small weighting changes materially alter rank.

### Explainability

Every score must provide:

- raw values and units;
- comparison percentiles;
- domain contributions;
- top positive and moderating drivers;
- missing or low-quality components;
- uncertainty;
- sensitivity;
- exact formula and version;
- source links.

### Validation boundaries

Create a validation plan before viewing results. Independent validation outcomes must not be inputs to the score being validated.

## Gate 4

- Analytics unit tests pass against hand-calculated fixtures.
- Uncertainty simulation is reproducible.
- Score decomposition sums correctly.
- Rankings are stable under row-order changes.
- Missing inputs do not become zero silently.
- No tautological validation exists.
- `MODEL_CARD.md` documents intended and prohibited uses.

---

# Phase 5 — Design system and first complete user workflow

## Goal

Deliver a polished, intuitive vertical slice that a first-time policy user can understand without training.

## Build order

1. Global design tokens and accessible component library.
2. App shell and navigation.
3. Overview page.
4. Explore workflow.
5. Selected geography evidence drawer.
6. Shareable URL state.
7. Mobile/responsive behavior.
8. Empty, loading, stale, unavailable, and error states.

### UX review loop

For each page:

- open it in the built-in browser;
- test with real data;
- complete the first-time-user task from the UX spec;
- inspect at desktop and mobile widths;
- navigate only by keyboard;
- test dark/light only if both are supported—do not add dark mode merely for novelty;
- run axe;
- capture screenshot evidence;
- revise copy and hierarchy.

The interface must lead with plain-language conclusions and place formulas under “How this was calculated.”

## Gate 5

- A first-time user can identify a priority geography, understand why, inspect evidence, and share the state in under five minutes.
- No page is a wall of cards or tables.
- Map and non-map alternatives convey equivalent information.
- Keyboard focus is visible and logical.
- Color is never the only encoding.
- All charts expose data tables or accessible summaries.
- Browser inspection evidence is recorded.

---

# Phase 6 — Access Lab, routing, catchments, and intervention placement

## Goal

Move beyond centroid proximity to a transparent access analysis that can support mobile-clinic and service-location advocacy.

## Required work

### Resource quality

- Deduplicate facilities/resources by coordinates, names, addresses, and source priority.
- Distinguish licensed facilities, clinics, health centers, pharmacies, hospitals, food resources, transit, community locations, and providers.
- Expose source coverage and known omissions.
- Prefer official sources; treat OSM as supplemental and label it.

### Travel analysis

Implement a reproducible open-source routing approach, such as local Valhalla/OSRM/GraphHopper or a documented network-based fallback.

Calculate, where feasible:

- walking and driving travel times;
- transit travel-time proxies or scheduled accessibility using GTFS;
- nearest-resource time;
- resources within 15/30/45 minutes;
- population-weighted accessibility;
- rural/edge-case handling;
- uncertainty/coverage flags.

Centroid distance may remain as a fallback but must be labeled clearly.

### E2SFCA or equivalent

Implement an enhanced two-step floating catchment accessibility measure where inputs support it. Document:

- supply measure;
- demand denominator;
- catchment thresholds;
- distance decay;
- provider/facility capacity proxy;
- limitations.

### Intervention placement

Build a scenario engine using OR-Tools or an equivalent optimizer for questions such as:

- place 1–5 mobile clinic stops;
- maximize high-priority population within a travel threshold;
- minimize weighted travel burden;
- compare candidate community sites;
- enforce operating and equity constraints;
- compare against a baseline.

Output is a scenario, not a causal prediction. Expose assumptions and sensitivity.

## Gate 6

- Routing results pass sampled manual checks.
- Resource layers are deduplicated and provenance-visible.
- Access metrics are non-null where network coverage exists.
- Optimization outputs are reproducible and satisfy constraints.
- UI clearly distinguishes observed resource locations, modeled access, and scenario outputs.
- No scenario claims exact health benefit or cost savings without a validated model.

---

# Phase 7 — Utilization Lab and independent validation

## Goal

Use HCAI and other independent outcomes to test whether the prioritization framework has external validity and to provide real utilization context.

## Required work

### HCAI normalization

Build robust parsers for:

- patient county of residence ED characteristics;
- facility ED profiles;
- patient-origin and market-share files;
- preferred-language and payer information where available;
- diagnosis groups;
- annual trends;
- masking/suppression.

### Geography reconciliation

Use documented ZIP/ZCTA/tract crosswalks and quantify uncertainty introduced by crosswalking. Do not pretend ZIP-level outcomes are tract observations.

### Validation design

Test pre-specified hypotheses such as:

- independent utilization pressure versus priority domains;
- payer mix versus coverage-barrier domain;
- language mismatch/context versus language-access domain;
- ambulatory-care-sensitive ED patterns versus chronic burden;
- access measures versus patient-origin leakage or travel patterns where data support it.

Use:

- Spearman and Pearson where appropriate;
- uncertainty intervals;
- bootstrap confidence intervals;
- spatial autocorrelation diagnostics;
- spatial regression or geographically aware validation where justified;
- out-of-sample or temporal holdout where possible;
- calibration and error metrics for any predictive model;
- negative controls where useful.

Do not validate `diabetes_prevention_score` against diabetes prevalence if diabetes prevalence is an input. That is construction consistency, not validation.

### UI

The Validation Lab must show:

- question;
- independent outcome;
- analysis method;
- result with uncertainty;
- interpretation;
- what the result does not prove;
- source and geography caveats;
- downloadable table.

## Gate 7

- HCAI status is truthful and recent.
- Suppressed values remain suppressed.
- Validation outcomes are independent of score inputs.
- Spatial dependence is assessed.
- Results are not cherry-picked.
- Null or weak findings are shown, not hidden.
- `MODEL_CARD.md` and `RISK_REGISTER.md` are updated.

---

# Phase 8 — Advocate workspace, document intelligence, and optional AI copilot

## Goal

Turn analysis into defensible meeting preparation and advocacy materials without allowing the model to invent evidence.

## Required work

### Deterministic advocacy workspace

Without any AI key, users must be able to:

- select a geography or scenario;
- choose a policy question;
- assemble evidence cards;
- draft a one-page brief from templates;
- generate staff questions;
- create public-comment notes;
- export an evidence appendix;
- preserve citations and data vintages.

### Document ingestion

Support public PDF, DOCX, TXT, and pasted text with:

- file limits;
- text extraction;
- page/section references;
- document fingerprinting;
- prompt-injection isolation;
- local deletion;
- source labels;
- structured extraction of agenda items, agencies, money, geography, population, actions, dates, and decisions.

### Optional AI copilot

Implement the tool-grounded copilot from `docs/05_AI_COPILOT.md`:

- provider abstraction;
- Anthropic optional default;
- no-key deterministic mode;
- server-side tools only;
- read-only analytics queries;
- claim/evidence/citation objects;
- abstention when data do not support an answer;
- trace panel showing tools, sources, and assumptions;
- no hidden freehand calculations;
- no browsing of arbitrary untrusted URLs by default.

### Required copilot tasks

Test prompts such as:

- “Which communities should HAC investigate for diabetes prevention, and why?”
- “Where might mobile clinics reduce access friction under the stated assumptions?”
- “Summarize this agenda item and show the affected geographies.”
- “Draft five precise questions for staff, each tied to evidence.”
- “What evidence contradicts or weakens this recommendation?”
- “Create a one-page brief, but clearly label uncertainty and data gaps.”

## Gate 8

- Deterministic mode completes core advocacy workflows without an API key.
- AI answers contain valid citations and tool traces.
- Unsupported prompts produce abstention or clarification.
- Uploaded document instructions cannot override system behavior.
- All generated claims can be traced to data or document spans.
- No PHI is accepted or persisted.

---

# Phase 9 — Reporting, export, sharing, and meeting-ready workflows

## Goal

Make outputs usable outside the application.

## Required exports

- one-page advocacy brief;
- geography profile;
- intervention scenario brief;
- staff-question packet;
- public-comment outline;
- validation summary;
- methods appendix;
- evidence packet with citations;
- CSV/GeoJSON for selected results where licensing allows;
- accessible PDF and printable HTML.

### Export integrity

Every export must include:

- title and scope;
- generated date;
- geography and period;
- metric values and units;
- source and vintage;
- uncertainty or quality notes;
- methods version;
- limitations;
- links or identifiers for evidence;
- statement that the tool supports, rather than replaces, expert and community review.

### Sharing

Implement:

- shareable URLs for non-sensitive state;
- stable permalink encoding;
- export metadata;
- optional saved local workspaces;
- no accidental inclusion of secrets or uploaded private text in public URLs.

## Gate 9

- Exports render correctly and are accessible.
- Printed output is legible without interactive controls.
- Citations survive export.
- Reopening a share link restores the analytical state.
- Export values match API/warehouse values exactly.

---

# Phase 10 — Performance, accessibility, security, and operational hardening

## Goal

Make the platform safe, fast, reliable, and maintainable.

## Required work

### Performance

- measure Core Web Vitals;
- reduce initial JavaScript;
- lazy-load map and heavy analyses;
- use server-side aggregation or tiles for large geometry;
- cache immutable data artifacts;
- support degraded but informative source failure states;
- profile API and DuckDB queries;
- add request timeouts and cancellation.

### Accessibility

- WCAG 2.2 AA audit;
- keyboard-only workflows;
- screen-reader labels;
- high contrast;
- reduced-motion support;
- accessible map alternatives;
- chart data tables;
- focus management;
- form errors and status announcements;
- PDF accessibility checks.

### Security and privacy

- dependency audit;
- secret scanning;
- upload validation;
- path traversal protection;
- safe document parsing;
- prompt-injection defenses;
- read-only copilot database access;
- rate limiting;
- secure headers and CSP;
- no client-side secrets;
- logging without sensitive content;
- deletion controls for uploads;
- threat-model review.

### Operations

- deployment documentation;
- scheduled source refresh strategy;
- source-drift alerts;
- rollback procedure;
- backups for metadata and user-created non-sensitive workspaces;
- health, readiness, and data-freshness endpoints;
- observability hooks;
- versioned release notes.

## Gate 10

- Performance budgets pass on representative hardware.
- Axe and manual accessibility checks pass.
- No high-severity dependency vulnerabilities remain without documented mitigation.
- Threat model is complete.
- Deployment and rollback are tested.
- Data-refresh failure does not corrupt the last known-good snapshot.

---

# Phase 11 — Adversarial product review and final delivery

## Goal

Attempt to disprove the claim that the product is ready.

## Required review roles

Claude must independently review the product as:

- a skeptical county epidemiologist;
- a health-equity researcher;
- a GIS analyst;
- a commissioner with little technical training;
- a disability/accessibility tester;
- a privacy and security reviewer;
- a community advocate concerned about stigmatization;
- a data engineer responsible for refresh failures;
- a statistician looking for tautology, leakage, and false precision;
- a product designer testing first-use comprehension.

For each role:

- identify the five strongest objections;
- classify severity;
- reproduce issues where possible;
- fix them or document an explicit limitation;
- update the risk register.

### Final run

Run from a clean state:

```bash
make bootstrap
make data
make demo
make test
make audit
make export-demo
```

Start the app and inspect every required page in the browser. Run all e2e and accessibility tests. Verify exports.

### Final artifacts

Complete:

- `DELIVERY_REPORT.md`
- `MODEL_CARD.md`
- `DATA_DICTIONARY.md`
- `DATA_MANIFEST.json`
- `RISK_REGISTER.md`
- `DECISIONS.md`
- `CHANGELOG.md`
- deployment instructions;
- user guide;
- administrator/data-refresh guide;
- demo script;
- known limitations.

## Gate 11 — final definition of done

The product is complete only when:

- acceptance criteria have evidence, not assertions;
- no all-null or placeholder production fields remain;
- every score is explainable and uncertainty-aware;
- independent validation is present and honestly interpreted;
- major workflows are intuitive and accessible;
- the copilot is grounded or abstains;
- all exports preserve evidence and limitations;
- clean-room reproducibility has been demonstrated;
- the delivery report lists any remaining weaknesses plainly.

A product with documented limits can pass. A product that hides limits cannot.

---

# Autonomous continuation rules

When context is limited or a session ends:

1. Update `STATE.md` with:
   - current phase and gate;
   - completed work;
   - exact commands last run;
   - failing tests;
   - current server/process state;
   - next three actions;
   - files that need attention.
2. Update `TASKS.md` checkboxes.
3. Commit only coherent work.
4. Never tell the next session to “start over.”
5. The next session must read state, Git history, and test output before editing.

# Scope control

When a source or feature cannot be implemented safely:

- do not fake it;
- preserve the rest of the platform;
- expose an unavailable state;
- document what was attempted;
- record the exact blocker;
- identify the safest next implementation path;
- continue with independent work that does not rely on the blocked feature.

