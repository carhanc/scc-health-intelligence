# 04 — Architecture and Implementation Specification

## 1. Architecture goals

The architecture must be:

- reproducible on Apple Silicon macOS;
- easy for one developer to run;
- modular enough for county or research collaborators;
- resilient to public-source outages and schema drift;
- fast for interactive use;
- transparent and testable;
- deployable without requiring a complex enterprise stack;
- capable of adding private/internal data later without contaminating the public-data core.

Avoid premature microservices. Use a well-structured monorepo with clear module boundaries.

## 2. Recommended monorepo structure

```text
scc-health-intelligence/
├── CLAUDE.md
├── README.md
├── Makefile
├── pyproject.toml
├── uv.lock
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── .nvmrc
├── .python-version
├── .env.example
├── docker-compose.yml
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   ├── public/
│   │   └── tests/
│   └── api/
│       ├── src/scc_health_api/
│       │   ├── main.py
│       │   ├── routes/
│       │   ├── services/
│       │   ├── schemas/
│       │   ├── repositories/
│       │   └── settings.py
│       └── tests/
├── packages/
│   ├── ui/
│   ├── shared-types/
│   ├── eslint-config/
│   └── tsconfig/
├── pipelines/
│   ├── src/scc_health_pipeline/
│   │   ├── sources/
│   │   ├── geography/
│   │   ├── normalization/
│   │   ├── metrics/
│   │   ├── scoring/
│   │   ├── uncertainty/
│   │   ├── validation/
│   │   ├── routing/
│   │   ├── optimization/
│   │   ├── exports/
│   │   └── audits/
│   ├── tests/
│   └── fixtures/
├── data/
│   ├── raw/
│   ├── staged/
│   ├── curated/
│   ├── cache/
│   ├── exports/
│   └── .gitkeep
├── warehouse/
│   └── scc_health.duckdb
├── config/
│   ├── sources.yml
│   ├── metrics.yml
│   ├── scenarios.yml
│   ├── geographies.yml
│   └── freshness.yml
├── docs/
│   ├── adr/
│   ├── methods/
│   ├── data/
│   └── user-guide/
├── scripts/
│   ├── bootstrap_macos.sh
│   ├── dev.sh
│   ├── build_data.sh
│   ├── audit.sh
│   └── release.sh
├── tests/
│   ├── e2e/
│   ├── accessibility/
│   ├── visual/
│   └── contract/
├── PLAN.md
├── TASKS.md
├── STATE.md
├── DECISIONS.md
├── RISK_REGISTER.md
├── DATA_MANIFEST.json
├── DATA_DICTIONARY.md
├── MODEL_CARD.md
└── DELIVERY_REPORT.md
```

Claude may refine names, but preserve separation among web, API, pipeline, config, data, tests, and documentation.

## 3. Runtime and package management

### 3.1 Node

- Target Node.js 22 LTS or the current compatible LTS verified at build time.
- Include `.nvmrc` and/or Volta metadata.
- Use Corepack-managed `pnpm`.
- Do not require global npm packages.

### 3.2 Python

- Target Python 3.12.
- Use `uv` for interpreter and dependency management.
- Use a single root `pyproject.toml` or a documented workspace approach.
- Do not rely on the user’s Anaconda base environment.

### 3.3 Native dependencies

Minimize native setup. The Mac bootstrap script should check/install only what is required, such as:

- Xcode Command Line Tools;
- Homebrew if absent and user approves;
- `uv`;
- Node version manager or a project-local Node path;
- optional Java runtime only if transit routing with R5 is enabled;
- optional GDAL/GEOS/PROJ only if wheels are unavailable.

The bootstrap script must be idempotent and explain what it changes.

## 4. Frontend stack

Use current stable mutually compatible versions and pin them.

### Required

- Next.js App Router;
- React;
- strict TypeScript;
- Tailwind CSS;
- accessible component primitives such as Radix/shadcn patterns, customized rather than left visually generic;
- MapLibre GL JS;
- TanStack Query;
- TanStack Table;
- React Hook Form plus Zod;
- a declarative chart library such as Observable Plot, Vega-Lite, or ECharts;
- state management kept minimal, using URL state and server state before a global store;
- internationalization-ready message files.

### Frontend rules

- Server components where useful, client components only where interactivity requires them.
- No API keys or data-source secrets in the browser.
- Do not load massive raw GeoJSON if a vector-tile/PMTiles path is practical.
- Provide table alternatives for maps and charts.
- Use semantic HTML and tested accessible components.
- Use URL-search parameters for shareable filters and selections.
- Use loading/error boundaries.
- Use a central design-token system.

## 5. Backend stack

### Required

- FastAPI;
- Pydantic v2;
- pydantic-settings;
- Uvicorn for local development;
- DuckDB with spatial extension for analytical queries;
- PyArrow/Parquet/GeoParquet;
- Polars for large tabular transforms, Pandas/GeoPandas where ecosystem support is needed;
- Shapely and pyproj;
- scikit-learn;
- PySAL/esda/libpysal for spatial methods;
- OR-Tools for location optimization;
- HTTPX for source clients;
- structured logging.

### Backend rules

- Separate route, service, repository, and schema layers enough to test them independently.
- Use read-only warehouse connections for request handling.
- Heavy pipeline work runs as commands/jobs, not inside ordinary HTTP requests.
- Expose health, version, source-status, and model-status endpoints.
- Validate every request and bound query complexity.
- Return typed error objects with recovery guidance.

## 6. Analytical warehouse

Use DuckDB as the default local analytical warehouse.

### Required schemas/tables

```text
meta.sources
meta.builds
meta.metrics
meta.scenarios
geo.tracts
geo.zctas
geo.places
geo.supervisor_districts
geo.crosswalk_zip_tract
health.places_observations
social.acs_observations
context.svi
context.hpi
context.calenviroscreen
resources.facilities
resources.provider_locations
resources.transit_stops
resources.food_resources
resources.community_resources
access.travel_times
access.catchments
access.efca
utilization.hcai_ed
utilization.patient_origin
analytics.metric_values
analytics.domain_scores
analytics.scenario_scores
analytics.uncertainty_draws_or_summary
analytics.validation_results
documents.documents
documents.chunks
```

Physical table names may differ, but the concepts must exist.

### Data serving

- API queries DuckDB or precomputed Parquet.
- Map geometry is served through simplified GeoJSON for small layers or PMTiles/vector tiles for scale.
- Precompute frequently used profiles and rankings.
- Cache API responses with ETags.

## 7. Source adapter interface

Define a common Python protocol/base class.

Illustrative interface:

```python
class SourceAdapter(Protocol):
    source_id: str

    def discover(self) -> list[RemoteResource]: ...
    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact: ...
    def validate_raw(self, artifact: RawArtifact) -> ValidationReport: ...
    def normalize(self, artifact: RawArtifact) -> list[Path]: ...
    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport: ...
```

Each adapter must have:

- unit tests;
- an offline fixture;
- schema validation;
- content-type checks;
- retry/backoff;
- cache behavior;
- manifest output;
- a source-status result.

## 8. Configuration-driven analytics

Do not hardcode scenario formulas in UI components.

Use versioned YAML/JSON:

- `sources.yml`: discovery, cadence, required/optional, fallback;
- `metrics.yml`: source field, unit, domain, direction, uncertainty;
- `scenarios.yml`: weights, required metrics, constraints, copy;
- `geographies.yml`: canonical IDs, boundaries, aggregation rules;
- `freshness.yml`: warning/stale thresholds.

Validate configs through Pydantic models and tests.

## 9. API design

Version all APIs under `/api/v1`.

### Metadata and status

```text
GET /api/v1/health
GET /api/v1/version
GET /api/v1/sources
GET /api/v1/sources/{source_id}
GET /api/v1/builds/current
GET /api/v1/data-dictionary
```

### Geography

```text
GET /api/v1/geographies/search?q=
GET /api/v1/geographies/{type}/{id}
GET /api/v1/geographies/{type}/{id}/profile
GET /api/v1/geographies/{type}/{id}/neighbors
GET /api/v1/geographies/compare
```

### Metrics and scores

```text
GET /api/v1/metrics
GET /api/v1/metrics/{metric_id}
GET /api/v1/layers/{metric_or_score_id}
POST /api/v1/scenarios/evaluate
POST /api/v1/scenarios/compare
GET /api/v1/scenarios
GET /api/v1/scenarios/{scenario_id}
```

### Access and resources

```text
GET /api/v1/resources
GET /api/v1/resources/{resource_id}
POST /api/v1/access/nearest
POST /api/v1/access/catchment
POST /api/v1/access/optimize-sites
```

### Utilization and validation

```text
GET /api/v1/utilization/summary
GET /api/v1/utilization/patient-flow
GET /api/v1/validation
GET /api/v1/validation/{check_id}
```

### Documents and copilot

```text
POST /api/v1/documents/upload
GET /api/v1/documents
GET /api/v1/documents/{id}
POST /api/v1/copilot/query
POST /api/v1/reports/generate
GET /api/v1/reports/{id}
```

### Exports

```text
POST /api/v1/exports/profile
POST /api/v1/exports/scenario
POST /api/v1/exports/evidence-packet
```

## 10. Search and geocoding

### Geography search

Build a local search index over:

- tract names and GEOIDs;
- ZCTAs;
- cities;
- supervisor districts;
- resource names;
- aliases.

### Address search

Use a privacy-respecting geocoder behind an abstraction.

Preferred order:

- official or self-hostable geocoding where feasible;
- public geocoder with rate-limited, nonpersistent requests;
- optional commercial provider via env key.

Do not store searched addresses by default. Convert to coordinates and containing geography transiently.

## 11. Routing and travel-time architecture

Design a provider interface:

```text
StraightLineScreeningProvider
OSMNetworkProvider
TransitR5Provider
ExternalDirectionsProvider (optional)
```

Every result must identify the provider/method.

### Baseline

- projected-coordinate nearest distance;
- population-weighted origins;
- resource counts within radii.

### Walking/driving

- OSM network graph cached by county;
- shortest-path travel time;
- documented speed assumptions if edge speeds are missing.

### Transit

- VTA GTFS plus OSM network;
- R5 or OpenTripPlanner if practical;
- representative departure windows;
- service-date validation.

Routing failures must not silently downgrade. Return a typed “advanced route unavailable; screening distance available” result.

## 12. AI and retrieval architecture

Detailed behavior is in `05_AI_COPILOT.md`.

Implementation principles:

- provider abstraction;
- optional `ANTHROPIC_API_KEY`;
- local deterministic mode without LLM;
- read-only analytics tools;
- SQLite FTS5 and/or local vector store for documents;
- source-aware chunks with page/section metadata;
- server-side prompt templates;
- streaming response;
- citation validation;
- prompt-injection filtering and untrusted-document boundaries.

Do not let the LLM execute arbitrary SQL directly. Use constrained query planning, validated schemas, query limits, and read-only connections.

## 13. Report/export architecture

Generate:

- HTML print layouts;
- accessible PDF;
- Markdown;
- CSV/data appendix;
- PNG/SVG chart assets;
- optional DOCX.

Preferred PDF path:

- render a dedicated print route through Playwright/Chromium;
- include tagged/semantic HTML where possible;
- test page breaks;
- use vector charts;
- include source list and reproducibility ID.

Reports should be reproducible from a saved JSON specification.

## 14. Authentication and persistence

The public/open-data version should work without user accounts.

Use:

- local browser storage for saved workspaces;
- export/import JSON;
- signed share-state URLs if server persistence is added;
- optional authentication only if needed for private document storage or team workspaces.

Do not add auth complexity before core workflows are excellent.

## 15. Security

- Secrets server-side only.
- `.env.example` contains names, not values.
- redact secrets from logs.
- size/type limits on uploads.
- virus/malware scanning hook if public deployment accepts files.
- no shell execution from user content.
- sanitize document and Markdown rendering.
- read-only analytics DB for web requests.
- rate-limit expensive endpoints.
- strict CORS.
- Content Security Policy.
- dependency auditing.
- no PHI claim and explicit upload warning.

## 16. Testing stack

### Python

- pytest;
- hypothesis where useful;
- Ruff;
- mypy or pyright;
- coverage;
- snapshot/fixture tests for source adapters;
- data quality tests.

### TypeScript

- Vitest;
- React Testing Library;
- ESLint;
- TypeScript strict checks;
- Storybook or equivalent for key components if useful.

### End-to-end

- Playwright;
- axe accessibility integration;
- browser screenshots;
- mobile and desktop projects;
- API contract tests.

### Data contracts

Use Pydantic/Pandera/Great Expectations or lightweight custom contracts. Prefer understandable tests over a heavy framework used superficially.

## 17. Continuous integration

GitHub Actions should run:

- formatting/lint;
- type checks;
- Python and TypeScript unit tests;
- API contract tests;
- a fixture-based offline pipeline;
- Playwright smoke tests;
- accessibility tests;
- build;
- dependency/security checks.

Live-source refresh jobs should be separate from pull-request CI.

## 18. Deployment

Design for two modes.

### Local/research mode

- one-command startup;
- DuckDB and local files;
- no account;
- optional local AI provider;
- all public data cached locally.

### Hosted public mode

- containerized FastAPI and worker;
- object storage for data artifacts;
- persistent database only if needed;
- CDN for PMTiles/static assets;
- Vercel or equivalent for Next.js only if compatible with the API architecture;
- background refresh schedule;
- health checks and rollback;
- optional Sentry/telemetry with privacy controls.

Claude must choose and document a deployment target that supports the full stack rather than forcing heavy analytics into serverless request limits.

## 19. Performance targets

On a modern laptop after data is built:

- initial shell interactive within 2.5 seconds under typical local conditions;
- map pan/zoom at 45+ FPS for tract layers;
- selection response under 250 ms after data load;
- ordinary profile API response under 500 ms;
- scenario evaluation under 2 seconds for precomputed metrics;
- report generation under 30 seconds;
- no multi-megabyte JSON payload when tiles or summaries suffice.

Use performance budgets and measure them.

## 20. Observability

Required:

- structured JSON logs in hosted mode;
- request ID;
- source-refresh logs;
- audit artifacts;
- current build/version endpoint;
- source-status endpoint;
- job status;
- user-visible nontechnical status page;
- no sensitive document text in logs by default.

## 21. Top-level commands

Implement these exact commands:

```bash
make bootstrap
make data
make demo
make dev
make test
make audit
make export-demo
```

Additional useful commands:

```bash
make lint
make typecheck
make test-unit
make test-e2e
make refresh SOURCE=cdc_places
make docs
make build
make clean-generated
```

`make data` must be restartable and cache-aware.

## 22. Demo mode

Create an offline deterministic demo built from:

- small checked-in source fixtures;
- or versioned last-known-good public extracts if licensing permits;
- never invented production values.

Demo mode must be visibly labeled and must not be confused with live/current data.

## 23. Versioning

Version:

- application release;
- data build;
- metric registry;
- scenario registry;
- model/method;
- source adapter;
- report template.

Use semantic versioning for the app and explicit hashes for analytical configurations.

## 24. Documentation deliverables

Required:

- setup guide;
- architecture overview;
- source adapter guide;
- data dictionary;
- methods guide;
- model card;
- user guide;
- contributor guide;
- deployment guide;
- privacy/security guide;
- demo script;
- troubleshooting guide;
- limitations;
- final delivery report.

## 25. Code-quality rules

- Strict types.
- Functions focused on one responsibility.
- No giant 1,000-line page components.
- No untested regex-based source parsing when structured metadata exists.
- No business logic embedded in presentation components.
- No duplicated score formulas across Python and TypeScript; backend/config is authoritative.
- No unexplained magic numbers.
- No broad exception swallowing.
- No silent `fillna(0)` for analytical variables.
- No hardcoded absolute user paths.
- No committed raw secrets or huge raw datasets.
- Comments explain why, not obvious syntax.
