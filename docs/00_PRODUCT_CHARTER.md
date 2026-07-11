# 00 — Product Charter

## 1. Product identity

**Working product name:** Santa Clara Health Intelligence  
**Repository name:** `scc-health-intelligence`  
**Tagline:** From neighborhood evidence to defensible public action.

This is a clean-room, open-data public-health intelligence, advocacy, and decision-support platform for Santa Clara County, California.

It is not merely a map, a composite score, a chatbot, or a PDF generator. It is a unified workflow that helps a user:

1. understand a geography or population;
2. locate where multiple forms of need overlap;
3. inspect why a place is being flagged;
4. compare plausible interventions under explicit assumptions;
5. validate whether a conclusion is robust and independently supported;
6. prepare an evidence-backed memo, question set, public comment, or briefing packet;
7. ask natural-language questions whose numeric answers are calculated from traceable data.

## 2. Problem statement

County commissioners, staff, advocates, and community organizations often face a fragmented workflow:

- health outcomes live in one portal;
- social conditions live in another;
- facility and provider locations are elsewhere;
- emergency-department utilization arrives in large spreadsheets;
- public meeting documents are scattered across agendas, packets, minutes, and budgets;
- analysts spend time reconciling incompatible geographies and vintages;
- nontechnical users receive rankings without methods or actionable interpretation;
- advocacy claims are difficult to reproduce, cite, and defend quickly.

The platform should compress that workflow without hiding complexity or overstating certainty.

## 3. Mission

Enable evidence-based public-health advocacy and planning by transforming current public data into understandable, auditable, geography-aware, action-oriented intelligence.

## 4. Vision

A first-time user should be able to open the platform and answer a meaningful question such as:

> Which Santa Clara County neighborhoods combine elevated diabetes burden, transportation barriers, limited clinical access, and high Medi-Cal or uninsured pressure—and what should the Health Advisory Commission ask staff next?

The answer should include:

- a map and ranked list;
- raw values and county-relative context;
- uncertainty and data-quality information;
- the main drivers of the result;
- nearby resources and travel-access estimates;
- independent utilization evidence where available;
- a clearly labeled intervention screen;
- an evidence-backed, copyable question or memo;
- citations to the exact source, vintage, and method.

## 5. Intended users

### 5.1 Health Advisory Commissioner

Needs to prepare for meetings, identify policy gaps, formulate precise questions, and justify agenda priorities. Has limited time and may not be a data specialist.

Primary jobs:

- prepare for an agenda item in under 15 minutes;
- identify affected communities;
- ask staff a stronger, more specific question;
- generate a brief with sources and limitations;
- compare a concern across supervisor districts or cities.

### 5.2 County or health-system analyst

Needs reproducible methods, downloadable data, transparent formulas, and clear provenance.

Primary jobs:

- inspect data lineage and freshness;
- reproduce a score;
- download tract-level outputs;
- evaluate sensitivity and uncertainty;
- validate public-data screens against internal data later.

### 5.3 Community advocate or nonprofit leader

Needs understandable evidence for testimony, grant applications, coalition work, and outreach planning.

Primary jobs:

- locate communities with overlapping needs;
- understand what drives the pattern;
- generate plain-language talking points;
- export a map and evidence table;
- avoid making unsupported claims.

### 5.4 Researcher or student

Needs methods, code, data dictionaries, and defensible limitations.

Primary jobs:

- inspect model design;
- reproduce analyses;
- compare alternative assumptions;
- download source-aligned data;
- contribute new modules.

### 5.5 Public reader

Needs a clear, non-alarmist explanation of neighborhood conditions without being overwhelmed by technical language.

## 6. Core user jobs

The product must be organized around these five jobs, visible on the home screen.

### Job A — Understand a place

> “Show me the health, access, resource, utilization, and environmental profile of this tract, city, ZIP area, or supervisor district.”

### Job B — Find where action may be most urgent

> “Which places show overlapping need for this issue, and how stable is that ranking?”

### Job C — Compare intervention options

> “Where would a mobile clinic, coverage-navigation program, pharmacy-access intervention, language-access program, diabetes-prevention program, or older-adult follow-up effort plausibly fit best?”

### Job D — Prepare advocacy

> “Turn the evidence into a one-page brief, staff questions, talking points, and a citation packet.”

### Job E — Ask the evidence

> “Answer a natural-language question by querying the actual data and public documents, with traceable calculations and citations.”

## 7. Product principles

### 7.1 Action before decoration

Every visualization must support a decision, question, comparison, or explanation. Remove decorative metrics that do not change user understanding.

### 7.2 Plain language first, technical detail on demand

The default view should explain what the result means. Formulas, uncertainty, raw fields, and code-level provenance remain one click away.

### 7.3 Raw value before rank

Percentiles help comparison but can conceal magnitude. Always show the raw value, unit, period, and comparison group alongside a percentile.

### 7.4 No universal “truth score”

There is no single objective priority score for every public-health decision. The platform should provide domain scores and scenario-specific priorities with explicit weights. A combined score is a screen, not a verdict.

### 7.5 Uncertainty is part of the result

Margins of error, confidence intervals, missingness, rank stability, and source limitations must be visible rather than buried in a methods page.

### 7.6 Independent validation only

Do not call a model validated because it correlates with an input used to construct it. Validation must use independent outcomes, external sources, holdout periods, or other non-tautological checks.

### 7.7 Official sources first

Prefer federal, state, county, and transit-agency data. Supplemental sources such as OpenStreetMap may fill gaps but must be labeled and never silently replace an official source.

### 7.8 Public-service visual language

The product should feel trustworthy, calm, modern, and civic. It should not look like a crypto terminal, a gaming leaderboard, or a dense internal BI dashboard.

### 7.9 One-click evidence

Every claim should be exportable with its source, date, method, and caveat.

### 7.10 Honest usefulness

The platform should be ambitious about helping users but conservative about claims. It supports prioritization and advocacy; it does not replace community engagement, official county systems, clinical judgment, or formal cost-effectiveness analysis.

## 8. Product scope

### 8.1 Required modules

1. **Overview** — task-first entry point and countywide situation summary.
2. **Explore** — interactive map and geography profiles.
3. **Prioritize** — issue-specific ranking, sensitivity, and intervention screens.
4. **Access Lab** — resource proximity, travel-time, catchment, and site-optimization analysis.
5. **Utilization Lab** — HCAI emergency-department and patient-origin analysis.
6. **Validate** — methods, uncertainty, data quality, sensitivity, and independent checks.
7. **Advocate** — brief, memo, talking-point, and evidence-packet generation.
8. **Copilot** — grounded natural-language analytics and public-document intelligence.
9. **Data Catalog** — sources, vintages, fields, licenses, lineage, and downloads.

### 8.2 Required geographic units

- 2020 Census tract as the canonical neighborhood unit;
- ZCTA/ZIP-related views when source data requires them;
- cities/places;
- Santa Clara County supervisor districts;
- countywide view;
- optional state legislative and congressional districts;
- Medical Service Study Areas, HPSAs, and MUA/P designations where available.

### 8.3 Required policy lenses

At minimum:

- diabetes and cardiometabolic prevention;
- coverage and Medi-Cal navigation;
- language access;
- mobile and transit-linked care;
- pharmacy access;
- older-adult and disability support;
- behavioral-health access;
- food access;
- emergency-department pressure and patient flow;
- environmental-health burden.

## 9. Explicit non-goals

The platform must not:

- provide individual medical advice;
- ingest or analyze protected health information;
- predict an individual person’s risk;
- claim that a recommended intervention will cause a quantified health improvement without a valid causal model;
- automatically allocate public funds;
- replace formal program evaluation;
- imply that a tract’s residents are homogeneous;
- treat modeled estimates as observed counts;
- hide missing or stale data;
- use AI-generated text as evidence;
- infer sensitive personal traits from addresses or uploaded documents.

## 10. Primary success metrics

### 10.1 Usability

- A new user can find the top three geographies for a selected issue in under three minutes.
- A new user can explain why one tract is prioritized without reading the methods page.
- A new user can produce a one-page advocacy brief in under five minutes.
- Key workflows require no more than three major decisions before showing useful output.

### 10.2 Trust

- Every displayed metric has a source and vintage.
- Every score can be decomposed.
- Every ranking has a stability or confidence indicator.
- Every export includes limitations.
- No production metric column is entirely null.

### 10.3 Analytical quality

- Geographic joins exceed the thresholds in the acceptance specification.
- ACS uncertainty is retained and used.
- External validation is independent.
- Missingness and stale-source behavior are explicit.
- Scenario results are reproducible from a configuration file.

### 10.4 Advocacy value

- The platform can generate a meeting-preparation packet that includes affected geographies, key drivers, independent evidence, staff questions, and source citations.
- A user can generate district-specific or issue-specific materials without manually assembling tables.
- The platform can trace every sentence containing a number back to a computation and source.

### 10.5 Engineering quality

- Fresh-clone setup works on Apple Silicon macOS.
- Core operation requires no paid key.
- Tests and audits run through one command.
- Live-source failure does not corrupt cached data or produce fake output.
- The application can be deployed reproducibly.

## 11. Signature workflows

### 11.1 Meeting preparation workflow

1. User uploads or selects an HAC/Board agenda item.
2. The system extracts topics, departments, populations, funding references, dates, and geographic cues.
3. The system maps the item to relevant metrics and geographies.
4. The user sees a concise “what matters” summary.
5. The system proposes evidence-backed questions for staff.
6. The user exports a meeting brief with citations and caveats.

### 11.2 Neighborhood profile workflow

1. User searches an address, tract, city, or district.
2. The system shows a plain-language summary.
3. User expands health burden, access barriers, resources, utilization, environment, and workforce domains.
4. User sees raw values, ranks, uncertainty, trends, and comparison geographies.
5. User exports a profile or shares a stateful link.

### 11.3 Intervention prioritization workflow

1. User chooses an intervention goal.
2. User selects population and geographic constraints.
3. The system ranks candidate geographies using a transparent scenario configuration.
4. The user sees drivers, confidence, resource gaps, and sensitivity.
5. For location-based interventions, the system proposes candidate sites and estimated reach.
6. User exports the scenario assumptions and result.

### 11.4 Evidence question workflow

1. User asks a plain-language question.
2. The system identifies whether the question requires analytics, documents, or both.
3. Numeric calculations are performed by tested tools or DuckDB SQL.
4. Document claims are retrieved from indexed public documents.
5. The answer includes a direct conclusion, evidence table, map/chart, method note, limitations, and citations.

## 12. What makes this materially better than a conventional dashboard

The product should combine capabilities that are usually separated:

- multi-source public-health data engineering;
- rigorous uncertainty and sensitivity analysis;
- geography reconciliation across tract, ZIP, district, and facility levels;
- resource and travel-access analysis;
- independent utilization validation;
- intervention-specific prioritization;
- location optimization;
- public-meeting document intelligence;
- citation-grounded advocacy writing;
- transparent data and model governance;
- an interface designed for nontechnical public-sector users.

The result should feel like a public-health research lab, policy analyst, GIS workstation, and advocacy-writing assistant consolidated into one coherent experience—without pretending to replace any of those professionals.
