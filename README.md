# Santa Clara Health Intelligence

An open-data public-health intelligence, advocacy, and decision-support platform for Santa Clara County, California. It helps commissioners, staff, advocates, and researchers understand neighborhood conditions, find where health needs and access barriers overlap, compare intervention scenarios under explicit assumptions, validate whether a finding is robust, and produce evidence-backed meeting materials — with source, vintage, uncertainty, and limitations shown at every step.

Developed by Arhan Chakravarthy. Not affiliated with, endorsed by, or an official system of Santa Clara County.

## What it does

- **Explore** — search any Santa Clara County place (city, ZIP, supervisor district, or census tract) and see its health, access, and resource picture, with every figure's source and uncertainty visible.
- **Prioritize** — rank every tract by combined concern under a named priority lens or your own custom weighting, with full explainability.
- **Access Lab** — real network- and transit-based accessibility modeling (E2SFCA), resource-gap analysis, and mobile-clinic siting scenarios.
- **Utilization** — real emergency-department utilization data (HCAI), clearly separating directly observed figures from modeled tract-level allocations.
- **Validate** — the platform's own methodology, uncertainty, and independent validation results, in plain language.
- **Advocate** — build a complete, evidence-grounded meeting packet: select a place or issue (or upload a meeting document), review matched evidence, and generate a brief, memo, question list, public comment, or source appendix — saved locally in your browser.
- **Copilot** — ask plain-language questions and get grounded, cited answers. Works fully with zero configuration (deterministic mode); an optional AI-assisted mode can be enabled by an operator who configures a provider key.

## Intended users

County commissioners and staff preparing for public meetings, community advocates building a case for a specific neighborhood, and researchers or analysts who need traceable, source-cited public health data — not a general audience dashboard, and not a replacement for clinical judgment, formal program evaluation, or community engagement.

## Data sources and observed vs. modeled

Every metric traces to a public federal, state, county, or transit-agency source — see the in-app **Data** page for the full, live source catalog (publisher, vintage, license, freshness). The platform is explicit throughout about what is **directly observed** versus **modeled or derived** (e.g., tract-level emergency-department rates are a disclosed area-weighted allocation from real ZIP-level HCAI data, never presented as directly observed). No score or correlation is ever described as proof of causation.

## Local setup

Requires Node 22+, `pnpm`, Python 3.12, and `uv`.

```bash
make bootstrap   # one-time local environment setup (macOS/Apple Silicon)
make data        # build the full warehouse from live public sources (real time, real network calls)
# — or —
make demo        # offline geography-only snapshot, no network access (see limitations below)
make dev         # start the API (:8000) and web (:3000) dev servers
make test        # unit + integration tests (Python + TypeScript)
make test-e2e    # Playwright end-to-end suite (needs make dev running)
make audit       # data-quality, freshness, and analytics-output audits
```

`make demo` currently covers geography only — health/social/analytics/utilization data has no offline snapshot yet (a disclosed, tracked limitation; see `RISK_REGISTER.md`). Running the full application requires `make data`.

## Tests

437 backend (pytest) + 66 frontend (vitest) unit/integration tests, 320+ Playwright end-to-end tests (desktop and mobile viewports), automated accessibility scans (axe-core) on every page and major workflow state, and responsive checks at six required widths (320px–1440px). All required as passing CI checks on every pull request.

## Privacy

No accounts, no PHI storage or handling capability, no tracking of who uses the platform. Advocate workspaces are stored only in your browser (IndexedDB) — never on the server. Uploaded documents are processed in memory for a single request and never persisted. See the in-app **Privacy** page and `docs/security/document-handling.md` for full detail.

## AI

Copilot's deterministic mode is always available with zero configuration and is the default in production. An optional AI-assisted mode (Anthropic) can be enabled by an operator via a server-side API key; every AI-assisted response is validated so it can only cite evidence it was actually given. See `docs/security/ai-production-readiness.md`.

## Production architecture and deployment

Frontend on Vercel, backend (FastAPI) on Render, data artifact published as a versioned GitHub Release and fetched at deploy time — see `docs/deployment/production-deployment-guide.md` for the exact, numbered deployment runbook, and `DECISIONS.md` (DEC-066) for why this architecture was chosen.

## Known limitations

Recorded honestly and continuously in `RISK_REGISTER.md` — highlights: no offline demo snapshot yet for analytics/utilization tables (live `make data` build required); DOCX advocacy export deferred (print-to-PDF and CSV are supported); AI-assisted Copilot mode has no golden-evaluation set run against a live provider yet (off in production for this release). See `MODEL_CARD.md` for the full, phase-by-phase limitations record.

## Documentation

- `docs/00_PRODUCT_CHARTER.md` through `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` — the original product/architecture/UX/security specification.
- `docs/methods/` — analytics and modeling methodology, one document per method.
- `docs/user-guide/` — plain-language guides to each page.
- `docs/security/` — document handling, dependency audit, incident response, AI production readiness.
- `docs/deployment/`, `docs/observability/`, `docs/data/` — operational runbooks.
- `TASKS.md`, `STATE.md`, `DECISIONS.md`, `RISK_REGISTER.md`, `MODEL_CARD.md`, `DATA_DICTIONARY.md` — living project-management and governance records.

## License

Not yet assigned — the repository owner has not selected a license for this code. Public data used by this platform remains subject to its own original source licenses (see the in-app Data page and `DATA_MANIFEST.json` for per-source terms).
