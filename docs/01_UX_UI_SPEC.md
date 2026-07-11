# 01 — UX and UI Specification

## 1. UX objective

The application must make sophisticated public-health analysis feel understandable and controlled rather than overwhelming. The design should reduce cognitive load while preserving access to methods and evidence.

A user should never have to wonder:

- What geography am I viewing?
- What question is this page answering?
- What time period is represented?
- Is this a raw value, percentile, modeled estimate, or scenario score?
- Why is this place ranked highly?
- How certain is the result?
- Where did the number come from?
- What can I do with this information?

## 2. Design character

Use a calm, credible civic-technology aesthetic.

### Desired qualities

- modern but not trendy;
- highly legible;
- spacious but information-dense when needed;
- restrained color use;
- trustworthy public-sector tone;
- sophisticated maps and charts without visual noise;
- excellent print/export presentation;
- warm enough for community use, rigorous enough for analysts.

### Avoid

- excessive gradients;
- glowing cards;
- “mission control” or military language;
- gamified leaderboards;
- walls of small metric cards;
- giant hero sections that displace the product;
- unexplained acronyms;
- red/green-only encoding;
- tiny legends;
- hidden scroll areas;
- tooltips as the only place essential information appears;
- dozens of toggles exposed at once;
- dark mode as the default;
- “AI magic” language.

## 3. Information architecture

Use a persistent left navigation on desktop and a compact bottom or drawer navigation on small screens.

Primary navigation:

1. **Overview**
2. **Explore**
3. **Prioritize**
4. **Access Lab**
5. **Validate**
6. **Advocate**
7. **Copilot**
8. **Data**

If eight items feel excessive during implementation, combine Access Lab into Prioritize and keep no more than seven primary items. Do not bury Validate or Data; trust features must remain visible.

### Global context bar

Every analytical page must show a compact, persistent context bar containing:

- geography and comparison group;
- selected issue/lens;
- data period or vintage;
- scenario name if applicable;
- data freshness status;
- share/export controls.

Changing context should update the page without losing the user’s location or selections.

## 4. Home / Overview page

### 4.1 Purpose

Help a first-time user choose a task and give returning users a concise countywide situation view.

### 4.2 Above-the-fold layout

Header:

- product name;
- one-sentence mission;
- search field: “Search an address, tract, city, ZIP area, or supervisor district”;
- data freshness indicator;
- help / guided tour.

Primary task cards, limited to four:

1. **Understand a place** — open Explore.
2. **Find where action may be urgent** — open Prioritize.
3. **Prepare advocacy or a meeting** — open Advocate.
4. **Ask the evidence** — open Copilot.

Each card should include a concrete example, not generic marketing copy.

### 4.3 County snapshot

Show a small number of decision-relevant summaries:

- number of tracts with overlapping high health burden and access barriers;
- number of high-need tracts with a resource-access gap;
- strongest countywide issue signals;
- data freshness and coverage;
- one “what changed” trend if defensible.

Never display a number without a label, source period, and link to explanation.

### 4.4 Recent or saved work

Allow users to reopen locally saved analyses without requiring an account. Store workspace state locally; provide export/import of a workspace JSON file.

### 4.5 Guided examples

Include clickable examples such as:

- “Find tracts where diabetes burden and transportation barriers overlap.”
- “Compare supervisor districts on coverage and language access.”
- “Prepare questions for a mobile-clinic agenda item.”
- “Show where pharmacy access is weakest among high-need tracts.”

## 5. Explore page

### 5.1 Purpose

Allow a user to inspect place-based conditions with strong context and progressive disclosure.

### 5.2 Desktop layout

Use a three-region layout:

- **Left control rail**: search, geography, lens, layers, period, comparison.
- **Center map**: primary visual workspace.
- **Right insight drawer**: selected geography profile.

The map should remain the largest region. The right drawer should be collapsible and resizable.

### 5.3 Map behavior

Use MapLibre GL with accessible controls.

Required behaviors:

- hover highlights tract and shows a compact tooltip;
- click selects a tract and opens the insight drawer;
- shift-click or a compare button selects a second geography;
- box or lasso select for multi-tract analysis if feasible;
- address search geocodes and selects the containing tract;
- map state is reflected in the URL;
- resource layers cluster at low zoom and expand at high zoom;
- current selection remains visible when layers change;
- legend updates with the chosen measure and clearly distinguishes raw value from percentile;
- map colors use a colorblind-safe sequential scale;
- null/unavailable areas use a neutral patterned or clearly labeled style rather than zero;
- map provides a table alternative for keyboard and screen-reader users.

### 5.4 Lens selector

Default lens choices:

- Health burden
- Access barriers
- Resource access
- ED utilization pressure
- Environmental burden
- Workforce shortage
- Integrated priority
- Custom metric

The selector should explain in one sentence what each lens means. “Integrated priority” must show the active weights and scenario.

### 5.5 Layer panel

Group layers into collapsible categories:

- care: clinics, health centers, hospitals, pharmacies, behavioral-health sites;
- mobility: transit stops, high-frequency routes, travel-time catchments;
- food and community: SNAP retailers, community centers, libraries, senior resources;
- boundaries: cities, supervisor districts, ZCTAs, HPSA/MUA, MSSA;
- contextual: CalEnviroScreen, HPI, SVI.

Each layer must show source and last refresh in its info popover.

### 5.6 Geography profile drawer

At the top:

- geography name and identifiers;
- city and supervisor district;
- population;
- one-sentence plain-language summary;
- confidence/stability indicator;
- buttons: compare, save, export, ask Copilot.

Then show six domain tabs:

1. Health
2. Access
3. Resources
4. Utilization
5. Environment
6. Population

Each domain begins with:

- key conclusion;
- two to four most important metrics;
- trend if valid;
- comparison to county and selected peer;
- data confidence.

A “See all metrics” section reveals the detailed table.

### 5.7 Metric row design

Each metric row must include:

- metric name in plain language;
- raw value and unit;
- county percentile;
- comparison bar or dot plot;
- uncertainty indicator or confidence interval;
- period/vintage;
- source icon/link;
- direction explanation (“higher means more concern” or “higher means more access”);
- optional definition and method drawer.

Do not display percentiles without raw values.

### 5.8 Driver explanation

For any domain or scenario score, show:

- top contributors;
- contribution direction;
- raw value;
- county percentile;
- uncertainty;
- source;
- share of score;
- what the metric does and does not imply.

Use a waterfall or ranked contribution chart, but always provide a text equivalent.

### 5.9 Compare mode

Compare two geographies side by side with:

- same metrics in aligned rows;
- raw difference;
- percentile difference;
- uncertainty overlap;
- time period;
- source consistency warning if vintages differ;
- narrative summary limited to supported differences.

Allow comparison between:

- tract vs tract;
- tract vs city/district aggregate;
- supervisor district vs district;
- selected geography vs county.

## 6. Prioritize page

### 6.1 Purpose

Help users identify where a defined intervention or policy question deserves investigation. This page should not start with a universal ranking.

### 6.2 Guided scenario builder

Use a step-by-step workflow with a visible progress indicator.

#### Step 1 — Choose the goal

Required goals:

- diabetes prevention and control;
- mobile or transit-linked care;
- coverage / Medi-Cal navigation;
- language-access outreach;
- pharmacy access;
- older-adult and disability support;
- behavioral-health access;
- food access;
- custom scenario.

Each goal includes:

- a plain-language description;
- default domains and weights;
- required data;
- limitation note;
- example use.

#### Step 2 — Choose who and where

Filters:

- all residents or selected age groups;
- poverty or insurance vulnerability;
- limited-English population;
- older adults;
- disability;
- supervisor district, city, or countywide;
- minimum population or data-quality threshold.

Do not allow demographic targeting that would create harmful individual inference. All analysis remains aggregate.

#### Step 3 — Set assumptions

Expose only a few understandable controls by default:

- relative emphasis on need, access barriers, resource gaps, and utilization;
- number of candidate sites or budget units when applicable;
- travel-time threshold;
- minimum data-confidence threshold.

An advanced drawer reveals exact weights and formulas.

#### Step 4 — Review results

Show:

- ranked map and list;
- score with uncertainty interval;
- probability of remaining top decile under weight variation;
- primary drivers;
- resource gaps;
- independent validation evidence;
- key caveat;
- suggested next question.

### 6.3 Ranking table

Columns:

- rank and rank-stability range;
- geography;
- scenario score;
- confidence/stability;
- top three drivers;
- resource-access note;
- population affected;
- supervisor district/city;
- action menu.

Users can sort by raw metrics, not only the composite score.

### 6.4 Sensitivity view

Provide:

- rank under default weights;
- rank under need-first, access-first, resource-first, and utilization-first presets;
- probability of top-decile status across randomized plausible weights;
- warning when a result is highly weight-sensitive.

Use language such as “stable across tested assumptions” or “sensitive to chosen priorities,” never “certain.”

### 6.5 Scenario comparison

Allow users to save and compare two scenarios. Show how rankings and selected populations change when assumptions change.

### 6.6 Intervention library

Each intervention template must include:

- intended problem;
- component metrics;
- default weights;
- evidence basis references;
- resource requirements;
- what the score means;
- what it does not mean;
- candidate staff questions;
- relevant public programs or departments when documented.

## 7. Access Lab

### 7.1 Purpose

Analyze proximity, travel time, provider/resource availability, catchments, and potential service-location options.

### 7.2 Modes

- nearest resource;
- resources within 15/30/45 minutes;
- population-weighted accessibility;
- Enhanced Two-Step Floating Catchment Area score;
- service desert screen;
- candidate mobile-clinic site optimization;
- before/after scenario comparison.

### 7.3 Travel mode selector

- walking;
- transit;
- driving;
- straight-line screening fallback.

The UI must clearly label the method actually used. If transit routing is unavailable, do not show a transit travel-time result generated from straight-line distance.

### 7.4 Resource browser

Filters:

- resource type;
- official vs supplemental source;
- operating status;
- public/HRSA/CMS/HCAI designation;
- language/service attributes when available;
- facility type;
- date last verified.

### 7.5 Mobile-clinic optimizer

Inputs:

- number of sites;
- eligible candidate locations;
- travel-time threshold;
- population/need weights;
- geographic constraints;
- exclusion of already well-served areas;
- minimum data confidence.

Outputs:

- recommended candidate sites;
- population and high-need population within catchment;
- marginal reach of each site;
- overlap between catchments;
- alternative near-optimal solutions;
- sensitivity to assumptions;
- explicit statement that this is a location-allocation scenario, not a forecast of outcomes or savings.

## 8. Utilization Lab

### 8.1 Purpose

Make HCAI emergency-department and patient-flow data understandable and policy-relevant.

### 8.2 Required views

- ED encounters by patient county and facility;
- expected payer distribution;
- preferred-language distribution when available;
- principal diagnosis group or ambulatory-care-sensitive group;
- admissions through the ED;
- patient-origin and destination flows by ZIP/ZCTA;
- out-of-county or out-of-system leakage where derivable;
- facility market concentration and destination diversity;
- time trend by available year.

### 8.3 Geography warning

HCAI data may be county-, facility-, or ZIP-level. The interface must show the native geography and disclose any crosswalk or allocation to tract. Tract estimates derived from ZIP/ZCTA must be labeled “allocated estimate,” display the allocation method, and carry an uncertainty/quality warning.

### 8.4 Flow visualization

Use a map and ranked table as the primary view. Sankey diagrams may be offered only as a secondary view and must remain readable.

## 9. Validate page

### 9.1 Purpose

Make the platform’s rigor inspectable by nontechnical and technical users.

### 9.2 Summary section

Show:

- data freshness;
- geographic join coverage;
- missingness;
- uncertainty coverage;
- scenario rank stability;
- independent validation status;
- known source outages;
- model version.

### 9.3 Methods explorer

Users can select a score and see:

- component domains;
- metrics;
- directionality;
- transformations;
- weights;
- missing-data rule;
- uncertainty method;
- sensitivity method;
- validation source;
- code/config reference.

### 9.4 Data-quality dashboard

Show source-by-source:

- status;
- last successful retrieval;
- source vintage;
- row count;
- expected geography count;
- duplicate IDs;
- null rates;
- schema drift;
- checksum;
- stale threshold;
- fallback status.

### 9.5 Validation results

Use independent checks only. For each check show:

- hypothesis;
- external outcome;
- geographic resolution;
- sample size;
- method;
- result;
- confidence interval where appropriate;
- spatial residual check;
- limitation;
- whether the evidence supports, weakly supports, contradicts, or is insufficient for the intended use.

### 9.6 Limitations

Make limitations readable and specific. Avoid a generic disclaimer wall. Group by:

- source limitations;
- geographic limitations;
- uncertainty;
- model limitations;
- interpretation limitations;
- AI limitations.

## 10. Advocate page

### 10.1 Purpose

Turn analysis into defensible communication without requiring manual assembly.

### 10.2 Brief builder

Inputs:

- audience: HAC, Board committee, supervisor office, county staff, community coalition, grant reviewer, public comment;
- issue;
- geography;
- length;
- tone: neutral analytical, advocacy, meeting-preparation;
- include map/chart options;
- include recommendations or only questions;
- citation style.

### 10.3 Required output types

- one-page evidence brief;
- three-minute public-comment outline;
- five-minute presentation talking points;
- staff question set;
- Board/HAC memo draft;
- district profile;
- intervention scenario brief;
- evidence appendix;
- data and methods appendix;
- accessible PDF;
- editable Markdown and DOCX if feasible.

### 10.4 Brief structure

Every generated brief should contain:

1. title and purpose;
2. direct finding;
3. affected geography/population;
4. key evidence table;
5. map or chart;
6. interpretation;
7. proposed questions or action options;
8. uncertainty and limitations;
9. source list with vintage and retrieval date;
10. reproducibility identifier or scenario configuration hash.

### 10.5 Evidence lock

A number must not appear in generated prose unless it is linked to a structured evidence object. Generated text must never be the source of a number.

## 11. Copilot page

Detailed behavior is specified in `05_AI_COPILOT.md`; the UI requirements are:

- prompt box with examples;
- visible scope selector: data, documents, or both;
- geography and period chips;
- answer sections: direct answer, evidence, visualization, method, caveats, sources;
- expandable SQL/tool trace for advanced users;
- “show on map,” “save analysis,” and “create brief” actions;
- document upload with privacy warning;
- no anthropomorphic avatar or unsupported “AI certainty” badges;
- a deterministic no-key mode with guided question templates.

## 12. Data Catalog page

Required features:

- searchable source list;
- status and freshness;
- official source link;
- data vintage and retrieval date;
- geography and update cadence;
- license/terms;
- fields used;
- adapter/fallback method;
- known limitations;
- download of processed tables and data dictionary;
- version history and changelog.

## 13. Onboarding and help

### 13.1 First-run tour

A five-step optional tour:

1. choose a task;
2. choose a geography;
3. understand raw value vs percentile;
4. inspect drivers and confidence;
5. export or ask a question.

### 13.2 Contextual help

Use short inline explanations. Methods drawers should not interrupt the main workflow.

### 13.3 Glossary

Provide definitions for terms such as:

- census tract;
- modeled estimate;
- percentile;
- margin of error;
- confidence interval;
- rank stability;
- resource gap;
- allocated estimate;
- correlation;
- causal impact;
- HPSA;
- FQHC;
- ZCTA.

## 14. Accessibility requirements

Meet WCAG 2.2 AA.

Required:

- full keyboard navigation;
- visible focus states;
- semantic headings and landmarks;
- accessible names for map controls;
- table equivalents for map-based information;
- no essential information conveyed only by color;
- sufficient contrast;
- motion reduction;
- screen-reader announcements for filter and selection changes;
- chart summaries and downloadable tables;
- skip links;
- minimum comfortable target sizes;
- accessible PDF exports;
- automated axe tests plus manual keyboard checks.

## 15. Internationalization and language access

Build the architecture with internationalization from the beginning.

Initial release:

- English interface and source content;
- infrastructure for Spanish, Vietnamese, and Simplified Chinese;
- machine translation may be offered only as a clearly labeled draft;
- official public launch translations require human review;
- metric names, definitions, and source titles must support locale files;
- number/date formatting must be locale-aware.

## 16. Responsive behavior

### Desktop

Full map workspace, multi-panel layouts, side-by-side comparison.

### Tablet

Map plus bottom sheet; controls collapse into drawers.

### Mobile

Task-first cards and list/table views take precedence over a tiny map. The map remains available but must not be the only path.

## 17. Loading, empty, error, and stale states

### Loading

Use skeletons that preserve layout. Show which data source is being loaded only in advanced status views.

### Empty

Explain why no result appears and what filter can change it.

### Source failure

Show:

- source name;
- last successful refresh;
- whether cached data is used;
- potential impact;
- retry action;
- link to data status.

### Stale data

Use a visible but non-alarmist freshness label. Do not silently mix vintages without disclosure.

### Partial coverage

Show coverage percentage and whether rankings exclude low-coverage geographies.

## 18. Visual system

### Typography

Use a highly legible sans-serif such as Source Sans 3, Inter, or a system stack through `next/font`. Avoid novelty fonts.

Suggested scale:

- page title: 32–40px desktop;
- section title: 22–28px;
- body: 16–18px;
- supporting text: no smaller than 14px;
- tabular numeric text: use tabular numerals.

### Color

Use a restrained palette:

- neutral warm-gray background;
- deep navy or slate for primary text;
- blue/teal for interactive and analytical emphasis;
- amber/orange for caution or uncertainty;
- red only for serious alerts, not ordinary high percentiles;
- colorblind-safe sequential/diverging map palettes.

Provide design tokens and test contrast.

### Elevation and borders

Use subtle borders and limited shadows. Information hierarchy should come from spacing, typography, and grouping rather than floating cards everywhere.

### Icons

Use one consistent accessible icon library. Pair unfamiliar icons with labels.

## 19. Content style

- Use sentence case.
- Prefer “higher estimated burden” to “worse neighborhood.”
- Prefer “may warrant deeper review” to “must receive funding.”
- Prefer “residents of this tract” to labels that define people by a condition.
- Avoid “vulnerable people” when “people facing access barriers” is more specific.
- Expand acronyms on first use.
- Separate observed data, modeled estimates, allocated estimates, and scenarios.
- Never describe a score of 100 as “100 percent bad.”

## 20. UX release gates

Before release, Claude must use the built-in browser to test at least these tasks:

1. Search an address and understand the tract profile.
2. Compare two tracts.
3. Find top diabetes-prevention priority areas.
4. Inspect why a result is high.
5. Change weights and understand sensitivity.
6. Find nearest clinical care and transit access.
7. Run a mobile-clinic location scenario.
8. Review HCAI utilization evidence.
9. Upload a public agenda and generate staff questions.
10. Export a one-page brief.
11. Use the application by keyboard only.
12. Complete the main workflow at mobile width.

For each task, capture a screenshot and record defects in `UX_REVIEW.md`. Fix all high-severity and medium-severity defects before completion.
