# Santa Clara Health Intelligence — Build Pack

This folder is **not an application yet**. It is a clean-room build specification for Claude Code to create a completely new application from scratch.

The intended product is **Santa Clara Health Intelligence**: an open-data public-health intelligence, advocacy, and decision-support platform for Santa Clara County. It must be materially more rigorous, more intuitive, more useful, and more polished than a typical public-health dashboard.

## Why this is a spec pack instead of one giant pasted prompt

Claude Code performs better when persistent rules live in `CLAUDE.md` and detailed requirements are split into focused repository documents. The bootstrap prompt tells Claude Code to read the full specification in sequence, maintain a plan, implement in phases, test continuously, and refuse to fake missing data.

You still get a single copy/paste prompt in `BOOTSTRAP_PROMPT.txt`, but the detailed requirements remain available throughout the build rather than disappearing when a chat context is compacted.

## Critical clean-room rule

This must be a new repository. Claude Code must not inspect, copy, import, or reference the old `scc-caregap-atlas` repository or any sibling project. The new product should be built from the specifications in this folder and from verified official data sources.

## Recommended folder location

Use this exact path on your Mac:

```text
~/Desktop/scc-health-intelligence
```

## Exact Claude Desktop workflow

### 1. Put this folder on your Desktop

Download the ZIP provided with this build pack. In Terminal, run:

```bash
cd ~/Desktop
unzip ~/Downloads/scc-health-intelligence-build-pack.zip
```

The ZIP should create:

```text
~/Desktop/scc-health-intelligence
```

If a folder with that name already exists, rename it before unzipping:

```bash
mv ~/Desktop/scc-health-intelligence ~/Desktop/scc-health-intelligence-backup-$(date +%Y%m%d-%H%M%S)
cd ~/Desktop
unzip ~/Downloads/scc-health-intelligence-build-pack.zip
```

### 2. Open Claude Desktop

1. Open the Claude desktop app.
2. Click the **Code** tab.
3. Start a new Code session.
4. Choose the project folder:

```text
~/Desktop/scc-health-intelligence
```

5. Use the strongest coding/reasoning model available in your account.
6. Start in **Plan mode**.
7. Open `BOOTSTRAP_PROMPT.txt`, copy the entire contents, and paste it into Claude Code.

### 3. Review the plan before implementation

Claude must first:

- read all specification files,
- verify current official data sources,
- write `PLAN.md`, `TASKS.md`, `DECISIONS.md`, and `RISK_REGISTER.md`,
- propose the final architecture,
- identify external credentials that are optional versus required,
- create an implementation sequence with validation gates.

Read the plan. If it honors the specification, tell Claude:

```text
Approved. Switch from planning to implementation. Execute the full plan autonomously, keep TASKS.md and STATE.md current, run every required test and audit, use the built-in browser to inspect and improve the interface, and do not stop at a scaffold or partial prototype.
```

You may then switch the permission mode from Plan to a mode that allows edits and routine commands. Keep approval enabled for destructive commands or anything outside the project folder.

### 4. Let Claude build in phases

The project is intentionally large. Claude may reach a context or usage limit. That is expected. Progress must be persisted in repository files.

When starting a new Code session in the same folder, paste the contents of `CONTINUATION_PROMPT.txt`.

Do not restart the project from scratch. Claude should read `STATE.md`, `TASKS.md`, `DECISIONS.md`, the Git history, and test output, then continue from the first incomplete gate.

### 5. Run the final verification prompt

When Claude says the application is finished, paste `FINAL_VERIFICATION_PROMPT.txt`.

Do not accept completion until Claude has:

- run the full data pipeline,
- run backend and frontend tests,
- run data integrity audits,
- run accessibility tests,
- run Playwright end-to-end tests,
- start the application,
- inspect every major page in the built-in browser,
- fix visible usability problems,
- generate the final delivery report,
- demonstrate all required advocacy workflows with real data.

## Independent specialist review after the build

After the final verification pass, run two additional Code sessions in the same project folder:

1. Paste `UX_REVIEW_PROMPT.txt` to force an independent browser-based usability, information-design, responsive, and accessibility review.
2. Paste `METHODS_REVIEW_PROMPT.txt` to force a skeptical statistical, spatial, source, uncertainty, and validation review.

These are deliberately separate from the main builder prompt so Claude does not merely confirm its own earlier decisions. Require it to fix blocker/high findings, add regression tests, and update the risk/model documentation.

## Expected one-command workflow after the build

The completed repository must support these commands from its root:

```bash
make bootstrap
make data
make demo
make dev
make test
make audit
make export-demo
```

Expected meanings:

- `make bootstrap`: install project-local dependencies and verify the machine.
- `make data`: download, validate, harmonize, and build all available public data.
- `make demo`: build a deterministic cached demo dataset if live sources are temporarily unavailable.
- `make dev`: start the frontend and API together.
- `make test`: run unit, integration, and end-to-end tests.
- `make audit`: run data, methods, source, and output audits.
- `make export-demo`: create a sample advocacy brief and evidence packet.

Claude may choose equivalent implementation details, but these exact top-level commands must exist.

## Required local environment

The build must be designed for an Apple Silicon Mac. The preferred baseline is:

- macOS on Apple Silicon
- Node.js 22 LTS managed through `.nvmrc`, Volta, or a project bootstrap script
- `pnpm` through Corepack
- Python 3.12 managed by `uv`
- Git
- no mandatory Docker requirement for local development
- Docker support for reproducible deployment and CI

Claude must create `scripts/bootstrap_macos.sh` so you do not have to configure these manually.

## API keys and secrets

The core platform must work without a paid API key.

Optional capabilities may use:

```text
ANTHROPIC_API_KEY
CENSUS_API_KEY
MAPBOX_TOKEN
OPENROUTESERVICE_API_KEY
SENTRY_DSN
```

However:

- ACS ingestion must have a keyless official bulk-download fallback.
- the map must use a keyless basemap option.
- travel analysis must have an open-source fallback.
- the AI copilot must be optional; deterministic analytics and report generation must still work without it.
- all secrets must live in `.env.local` or server-side deployment secrets.
- no secret may be committed to Git or exposed to the browser.

A Census API key previously pasted into chat should be treated as compromised and replaced before reuse.

## What “done” means

This is not done when a landing page renders. It is done only when the acceptance criteria in `docs/06_ACCEPTANCE_TESTS.md` pass and `DELIVERY_REPORT.md` documents evidence for each criterion.

The completed product must be:

- **trustworthy**: sources, dates, methods, uncertainty, and limitations are visible;
- **actionable**: it supports real advocacy and meeting-preparation workflows;
- **interpretable**: every score decomposes into understandable drivers;
- **rigorous**: uncertainty and sensitivity are quantified, and validation uses independent outcomes;
- **intuitive**: a first-time user can answer a meaningful question without training;
- **accessible**: WCAG 2.2 AA behavior is tested;
- **reproducible**: a fresh clone can rebuild the platform without manual patching;
- **honest**: it never presents correlation, heuristics, or allocation scenarios as causal truth;
- **beautiful**: the interface feels calm, credible, modern, and public-service oriented rather than like a dense engineering dashboard.

## Documents Claude must read

Read these in order:

1. `CLAUDE.md`
2. `docs/00_PRODUCT_CHARTER.md`
3. `docs/01_UX_UI_SPEC.md`
4. `docs/02_DATA_SOURCE_REGISTRY.md`
5. `docs/03_ANALYTICS_METHODS.md`
6. `docs/04_ARCHITECTURE_IMPLEMENTATION.md`
7. `docs/05_AI_COPILOT.md`
8. `docs/06_ACCEPTANCE_TESTS.md`
9. `docs/07_BUILD_PHASES.md`
10. `docs/08_CONTENT_REPORTING.md`
11. `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`

## Important reality check

The target is an exceptional decision-support platform, not an oracle. No responsible tool should be the sole basis for allocating public funds or making clinical decisions. The platform should make advocacy more defensible, analysis faster, and questions sharper while preserving the role of community input, subject-matter experts, official county systems, and professional judgment.
