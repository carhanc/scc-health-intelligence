# Master Build Directive — Santa Clara Health Intelligence

> This is the consolidated product and engineering directive. `BOOTSTRAP_PROMPT.txt` is the recommended first message to Claude Code because it tells Claude to load this directive and the focused specifications. Use this file when a single human-readable master document is needed.

---

# 1. Executive mandate

Build **Santa Clara Health Intelligence**, a clean-room, open-data public-health intelligence, advocacy, and decision-support platform for Santa Clara County.

The product must not be a prettier version of a simple tract-ranking dashboard. It must be an integrated evidence system that helps users move from a public question to a defensible action:

```text
Question
  → relevant geography and population
  → current public evidence
  → uncertainty and data quality
  → drivers and comparisons
  → resource and utilization context
  → intervention scenarios and tradeoffs
  → independent validation
  → evidence-backed questions and reports
```

The product must be:

- intuitive enough for a commissioner or advocate with no data-science training;
- rigorous enough for a skeptical epidemiologist or statistician to inspect;
- reproducible enough for another engineer to rebuild;
- transparent enough that no score or AI answer requires blind trust;
- accessible enough to support keyboard, screen-reader, low-vision, mobile, and non-map workflows;
- useful enough to support real meeting preparation, public testimony, staff questions, and program-planning conversations;
- honest enough to show null findings, source outages, uncertainty, assumptions, and limitations.

It must not claim that public aggregate data can replace community knowledge, staff expertise, patient-level systems, causal program evaluation, or official budget deliberation.

---

# 2. Clean-room implementation

This is a brand-new repository.

- Never inspect, list, read, import, copy, or reference `~/Desktop/scc-caregap-atlas`.
- Never use any sibling repository as an implementation reference.
- Build only from this specification, verified official documentation, and newly written code.
- Do not migrate old data artifacts.
- Record the boundary in planning and delivery artifacts.

The clean-room requirement exists to force a better architecture and prevent accidental inheritance of brittle scripts, undocumented compromises, and UI assumptions.

---

# 3. Primary users and jobs

## 3.1 Health Advisory Commission member

Needs to:

- prepare for meetings quickly;
- understand a proposed issue geographically;
- ask staff precise, evidence-backed questions;
- identify missing implementation details;
- compare the strength of competing claims;
- export a concise memo.

## 3.2 County staff analyst

Needs to:

- inspect source definitions and vintages;
- reproduce analytics;
- identify neighborhoods for deeper review;
- compare policy lenses;
- examine resource and utilization context;
- export transparent tables and methods.

## 3.3 Community advocate

Needs to:

- find evidence relevant to a community or issue;
- understand values without statistical jargon;
- prepare public comment or a briefing;
- cite sources correctly;
- avoid overstating what the data prove.

## 3.4 Researcher or method reviewer

Needs to:

- inspect formulas, uncertainty, sensitivity, crosswalks, and validation;
- download data and evidence;
- distinguish observed, modeled, and scenario outputs;
- identify data gaps and bias risks.

## 3.5 Public visitor

Needs to:

- understand the product in seconds;
- search a location;
- see a clear takeaway and raw evidence;
- know when data are old, uncertain, unavailable, or modeled.

---

# 4. Product promise and guardrail

## Product promise

> Find where health needs, access barriers, environmental conditions, resource gaps, and utilization pressures overlap; understand why; compare transparent policy options; and turn the evidence into defensible public questions and reports.

## Guardrail

> This is a public-data screening and deliberation tool. It does not diagnose individuals, prove causality, predict exact program effects, or automatically allocate resources.

The promise and guardrail must appear in product onboarding, methodology, exports, and the model card.

---

# 5. Information architecture

The application must be organized around tasks rather than source names.

## 5.1 Overview

Purpose:

- orient first-time users;
- show data freshness and system status;
- offer three guided starting actions;
- display a few meaningful countywide findings;
- avoid an overwhelming dashboard wall.

Required actions:

- Explore a community
- Compare priorities
- Prepare for a meeting

## 5.2 Explore

Purpose:

- understand a geography, metric, or population;
- inspect raw values and drivers;
- compare with county and peers.

Required:

- address/geography search;
- map and table alternatives;
- metric and policy-lens selection;
- context bar showing geography, period, lens, and comparison;
- raw values, units, source, vintage, uncertainty;
- peer comparison;
- trend only when comparable;
- driver decomposition;
- resources/assets;
- source/method drawer;
- shareable state.

## 5.3 Prioritize

Purpose:

- compare geographies under transparent values and assumptions.

Required:

- domain scores;
- named policy lenses;
- adjustable weights with plain-language descriptions;
- uncertainty-aware ranking;
- probability of top-tier inclusion;
- sensitivity/stability;
- movement under alternate lenses;
- exclusion/inclusion explanation;
- downloadable evidence table.

The interface must never imply that rank 1 is objectively “the worst” or automatically entitled to funding.

## 5.4 Access Lab

Purpose:

- understand whether public and community resources are reachable;
- test service-location scenarios.

Required:

- deduplicated facilities/resources;
- official source priority and coverage notes;
- clinical care, HRSA health centers, hospitals, pharmacies, food resources, transit, community resources, senior resources, and other relevant assets;
- walking/driving/transit access where technically defensible;
- nearest-resource and resources-within-threshold measures;
- E2SFCA or equivalent accessibility;
- candidate-site comparison;
- mobile-clinic/service-location optimizer;
- equity constraints;
- baseline versus scenario;
- assumption and sensitivity controls;
- no exact outcome claim.

## 5.5 Utilization Lab

Purpose:

- inspect public HCAI utilization, payer, language, diagnosis, patient-origin, and facility context.

Required:

- native geography preserved;
- clear distinction between county, ZIP/ZCTA, facility, and crosswalked tract results;
- masking/suppression;
- annual trend comparison where definitions align;
- ED visits, payer, disposition, preferred language, diagnoses, patient origin/market share as available;
- denominator-aware rates where denominators are valid;
- crosswalk uncertainty;
- linkage to need/access without causal language.

## 5.6 Validation Lab

Purpose:

- show whether priority measures align with independent outcomes.

Required:

- pre-specified question;
- independent outcome;
- method;
- result and uncertainty;
- spatial diagnostics;
- temporal/out-of-sample evaluation where possible;
- counterevidence;
- “what this does not prove”;
- downloadable data;
- no construction-variable validation disguised as external validation.

## 5.7 Advocate

Purpose:

- convert analysis into meeting-ready material.

Required:

- evidence selection;
- staff-question generator;
- one-page brief;
- geography profile;
- intervention scenario brief;
- public-comment outline;
- evidence packet;
- editable structured blocks;
- citations and data vintages;
- accessible HTML/print/PDF;
- deterministic no-key mode.

## 5.8 Document Intelligence

Purpose:

- connect agendas, minutes, budgets, reports, and transcripts to geography and evidence.

Required:

- PDF/DOCX/TXT/paste input;
- PHI/confidential-data warning;
- page/section citations;
- agenda item, department, decision, vote, money, deadline, geography, population, metric, commitment, and unresolved-question extraction;
- document comparison across dates;
- recurring issue tracker;
- connection to tract/district evidence;
- prompt-injection isolation.

## 5.9 Copilot

Purpose:

- answer public-health policy questions using typed analytics tools and cited documents.

Required:

- no-key deterministic mode;
- optional Anthropic provider;
- provider abstraction;
- approved tools only;
- read-only analytics;
- no freehand numeric calculation;
- citations adjacent to claims;
- trace and assumptions;
- abstention;
- counterevidence;
- report generation through structured claim objects.

## 5.10 Data & Methods

Purpose:

- make trust inspectable.

Required:

- source status;
- vintage/retrieval/update cadence;
- provenance and checksums;
- metric dictionary;
- formulas;
- uncertainty;
- sensitivity;
- validation status;
- source limitations;
- release notes;
- downloadable model card.

---

# 6. Data backbone

## 6.1 Canonical geography

Use 2020 Census tracts as the canonical neighborhood geography while preserving every source’s native geography.

Rules:

- canonical tract GEOID is an 11-character string;
- never allow CSV inference to strip leading zeros;
- use explicit, versioned geography dimensions;
- store original and simplified geometry;
- use EPSG:4326 for web delivery and a California projected CRS for distances;
- store tract, block group where needed, ZCTA, ZIP crosswalk, city/place, county, supervisor district, legislative districts, MSSA, HPSA/MUA/P, and facility/resource points;
- quantify crosswalk uncertainty;
- do not call ZIP and ZCTA equivalent.

## 6.2 Core sources

Verify and implement current official versions of:

- CDC PLACES;
- ACS 5-year estimates and MOEs;
- Census TIGER/Line;
- CDC/ATSDR Social Vulnerability Index;
- California Healthy Places Index;
- CalEnviroScreen;
- HCAI ED data and facility profiles;
- HCAI patient-origin/market-share;
- HCAI facility inventory and attributes;
- HRSA health-center sites;
- HRSA shortage designations;
- NPPES only where justified;
- Santa Clara County GIS/open data;
- VTA GTFS;
- HUD USPS ZIP–tract crosswalk;
- USDA SNAP/resource data where allowed;
- official county meeting/agendas/minutes/reports;
- OpenStreetMap only as supplemental.

## 6.3 Provenance

Every raw artifact must have:

- source ID;
- official landing page;
- exact resource URL;
- source vintage;
- retrieval timestamp;
- checksum;
- byte and row counts;
- schema fingerprint;
- license;
- parser version;
- warnings;
- last-known-good status.

Every curated field must trace to raw artifact and transformation.

## 6.4 Source failure

When a source fails:

- do not emit an empty successful table;
- do not fill missing metrics with zero;
- do not silently switch definitions;
- keep the last verified snapshot;
- show stale/unavailable status;
- log the error;
- continue independent components.

---

# 7. Analytical framework

## 7.1 Metric registry

Every metric needs:

- ID and display name;
- definition;
- numerator/denominator;
- unit;
- directionality;
- source field/table;
- geography;
- vintage;
- uncertainty;
- transformation;
- limitations;
- inclusion in domains;
- citation.

## 7.2 Domains

At minimum:

1. health burden;
2. access and socioeconomic barriers;
3. resource accessibility;
4. environmental/contextual burden;
5. utilization pressure as independent context.

Do not collapse everything into one mandatory score. A priority lens may combine domains, but users must see domains separately.

## 7.3 Uncertainty

- retain ACS MOEs;
- retain PLACES intervals;
- derive standard errors carefully;
- use Monte Carlo propagation with deterministic seeds;
- calculate rank/percentile intervals;
- calculate probability of top-tier membership;
- expose estimate reliability;
- avoid exact ordinal rank when uncertainty is high.

## 7.4 Sensitivity

- named weight profiles;
- defensible weight perturbations;
- rank stability;
- top-decile inclusion frequency;
- driver stability;
- score range;
- warnings for fragile conclusions.

## 7.5 Explainability

For any selected score show:

- raw metric values and units;
- comparison percentiles;
- contribution to each domain;
- top drivers;
- moderating factors/assets;
- missing components;
- uncertainty;
- sensitivity;
- exact formula/version;
- source/vintage.

## 7.6 Resource accessibility

Prefer network travel time over centroid distance. Provide fallback labels.

Compute as feasible:

- nearest-resource time/distance;
- count/capacity within thresholds;
- population-weighted access;
- E2SFCA or equivalent;
- transit schedule accessibility;
- resource inventory quality;
- facility capacity proxy;
- rural and county-edge behavior.

## 7.7 Scenario optimization

Use transparent constrained optimization for service placement.

Inputs:

- candidate sites;
- number of sites;
- capacity;
- travel thresholds;
- target population/priority measure;
- operating constraints;
- equity constraints;
- objective.

Outputs:

- selected sites;
- modeled coverage/reach;
- change from baseline;
- who gains/does not gain;
- tradeoffs;
- sensitivity;
- assumptions;
- no causal health impact claim.

## 7.8 Independent validation

Pre-register validation questions. Use outcomes that are not score inputs.

Evaluate:

- correlation/association with intervals;
- spatial autocorrelation;
- spatial regression if appropriate;
- temporal or out-of-sample tests;
- calibration/error for predictions;
- negative controls;
- subgroup/geography robustness;
- null and contradictory findings.

---

# 8. UI/UX system

## 8.1 Design language

The visual system should feel calm, modern, civic, trustworthy, and highly polished.

Avoid:

- neon or sensational colors;
- decorative gradients as the primary style;
- glassmorphism;
- excessive shadows;
- tiny text;
- dense card walls;
- dashboard chrome everywhere;
- animated gimmicks;
- map-first assumptions;
- unexplained acronyms;
- score fetishization.

Use:

- a restrained accessible palette;
- strong typography and spacing;
- clear task-based navigation;
- a persistent context bar;
- progressive disclosure;
- human-readable summaries;
- strong empty/error states;
- thoughtful maps and tables;
- visible provenance and uncertainty;
- contextual help;
- keyboard-first interaction;
- responsive layouts.

## 8.2 Interaction principles

- One clear primary action per view.
- Preserve analytical state across navigation.
- Every map interaction has a table/list alternative.
- Search supports addresses and named geographies.
- Filters communicate impact and can be reset.
- Long tasks show progress and can be cancelled.
- Comparison mode is explicit.
- Share links reproduce the view.
- Export is available at the moment insight is created.
- “How calculated” and “Why flagged” are always nearby.

## 8.3 First-use success

A first-time user should be able to:

- understand the purpose in 15 seconds;
- search a community in under 30 seconds;
- identify the main finding in under 60 seconds;
- understand the top drivers in under two minutes;
- generate a useful staff question in under five minutes.

Test this through browser walkthroughs, not assumptions.

## 8.4 Accessibility

WCAG 2.2 AA is a release gate.

- keyboard navigation;
- visible focus;
- semantic landmarks/headings;
- labels and descriptions;
- screen-reader status updates;
- contrast;
- reduced motion;
- non-color encodings;
- map alternative;
- chart summaries and data tables;
- accessible exports;
- mobile target sizing;
- error identification and recovery.

---

# 9. Architecture

Preferred monorepo:

```text
apps/web
apps/api
packages/ui
packages/schemas
packages/config
pipelines/sources
pipelines/transforms
pipelines/geography
pipelines/analytics
pipelines/validation
pipelines/exports
data/raw
data/staged
data/curated
data/demo
warehouse
tests
scripts
docs
```

Preferred stack:

- Next.js App Router and strict TypeScript;
- accessible component primitives and project-owned design tokens;
- MapLibre GL;
- TanStack Query/Table;
- accessible charting;
- Python 3.12;
- FastAPI/Pydantic;
- DuckDB spatial and GeoParquet;
- Polars/Pandas;
- GeoPandas/Shapely/PyArrow/PySAL;
- scikit-learn/statsmodels as justified;
- OR-Tools;
- pnpm/Corepack;
- uv;
- Ruff/type checking;
- ESLint/Prettier;
- pytest/Vitest/Playwright/axe.

Core local development must not require Docker or a paid key. Add Docker for reproducible deployment/CI.

Required root commands:

```bash
make bootstrap
make data
make demo
make dev
make test
make audit
make export-demo
```

---

# 10. AI and document architecture

## Deterministic mode

Without an AI key, the platform must:

- execute analytics;
- generate templated claim objects;
- produce evidence-backed reports;
- extract deterministic document metadata and keywords;
- support search and filtering;
- generate staff questions from rule-based structures.

## Optional AI mode

The AI model may:

- select approved tools;
- summarize tool and document evidence;
- draft structured claims;
- compare alternatives;
- surface uncertainty and counterevidence;
- turn claim objects into clear writing.

The AI model may not:

- invent numbers;
- invent citations;
- execute arbitrary SQL or code;
- access files outside approved stores;
- follow instructions embedded in documents;
- fetch arbitrary URLs;
- make final high-stakes decisions;
- conceal uncertainty.

Every answer must expose:

- claims;
- citations;
- tools used;
- geography/time scope;
- assumptions;
- limitations;
- methods version.

---

# 11. Reports and advocacy outputs

Required:

- one-page advocacy brief;
- geography profile;
- intervention scenario brief;
- staff-question packet;
- public-comment outline;
- validation summary;
- evidence packet;
- selected CSV/GeoJSON where permitted.

Every export must include:

- title/scope;
- geography/period;
- values/units;
- uncertainty;
- source/vintage;
- methods version;
- limitations;
- generated date;
- evidence identifiers;
- decision-support disclaimer.

Generated writing must distinguish observation, derived measure, association, scenario, and recommendation prompt.

---

# 12. Security, privacy, and governance

- No PHI.
- Explicit upload warning and acknowledgement.
- Local-first document handling.
- Explicit consent before sending content to an AI provider.
- Server-side secrets only.
- Safe document parsing.
- Size/page limits.
- Deletion controls.
- Prompt-injection defenses.
- Typed read-only tools.
- Query and compute limits.
- SSRF/path traversal protection.
- Dependency and secret scanning.
- Source licensing.
- audit logs without sensitive content.
- model/score versioning.
- intended/prohibited uses.
- last-known-good rollback.

---

# 13. Quality and test contract

The product is incomplete until it passes:

- clean bootstrap;
- source adapter tests;
- data contracts;
- geography/crosswalk audits;
- analytics hand calculations;
- uncertainty reproducibility;
- sensitivity tests;
- validation independence checks;
- API tests;
- component tests;
- end-to-end workflows;
- accessibility tests;
- browser visual review;
- export consistency;
- prompt-injection tests;
- security checks;
- performance budgets;
- deployment build;
- source refresh/rollback.

No all-null production columns, uncited claims, silent fallbacks, fake data, dead controls, or placeholder metrics may remain.

---

# 14. Execution model

## Plan first

Read all specs, verify sources, and write:

- PLAN.md
- TASKS.md
- STATE.md
- DECISIONS.md
- RISK_REGISTER.md
- source verification
- architecture diagrams
- information architecture
- user flows

Wait for plan approval before full implementation.

## Build in gated phases

Follow `docs/07_BUILD_PHASES.md`. At each gate:

- implement;
- test;
- audit;
- inspect in browser;
- fix;
- document;
- commit;
- update state.

Do not proceed through red gates.

## Continue across sessions

Read state, tasks, decisions, risk, Git history, and tests. Continue from the first incomplete gate. Never restart.

## Final adversarial review

Use `FINAL_VERIFICATION_PROMPT.txt`. Attempt to break the system, fix defects, and produce `DELIVERY_REPORT.md` with evidence.

---

# 15. Definition of exceptional

The product is exceptional only if a real user can:

1. arrive with a policy question;
2. find the relevant geography/population;
3. see a clear, sourced finding;
4. inspect raw values, uncertainty, and drivers;
5. understand resource and utilization context;
6. test an intervention scenario;
7. inspect independent validation and counterevidence;
8. turn the evidence into precise questions and a polished brief;
9. trace every claim to data or document evidence;
10. understand exactly what the platform does not know.

A flashy landing page is not exceptional. A high score is not evidence. An AI paragraph is not intelligence. The system becomes remarkable by making complex public evidence understandable, auditable, and actionable without disguising uncertainty.

