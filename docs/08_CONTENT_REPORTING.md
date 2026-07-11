# 08 — Content Design, Advocacy Writing, Reports, and Exports

## Purpose

Santa Clara Health Intelligence exists to turn complex public data into defensible public action. The content layer is therefore part of the analytical system, not decorative copy added at the end.

Every sentence must help a user answer one of four questions:

1. **What is happening?**
2. **Where and for whom is it happening?**
3. **How certain are we, and what could change the interpretation?**
4. **What question or action should follow?**

The application must never make a weak analysis sound stronger through polished prose.

---

# Content principles

## 1. Conclusion first, evidence immediately available

Lead with a plain-language conclusion, then show:

- the raw value;
- unit;
- comparison;
- uncertainty;
- source and vintage;
- drivers;
- limitations;
- next question.

Bad:

> Tract 5135 has a score of 93.7.

Better:

> This tract appears to face both high health burden and comparatively weak access to nearby resources. Its priority estimate is in the county’s top decile, but the exact rank is sensitive to how access and environmental factors are weighted.

## 2. Describe evidence, not people

Avoid language that stigmatizes communities.

Avoid:

- “bad neighborhood”;
- “noncompliant patients”;
- “high-risk people” without context;
- “burdened community” as a permanent identity;
- “desert” as an unqualified absolute.

Prefer:

- “the data indicate higher barriers in this area”;
- “residents may face longer modeled travel times”;
- “this tract has comparatively fewer mapped pharmacies within the selected threshold”;
- “the available public data support deeper review.”

## 3. Separate observation, inference, scenario, and recommendation

Use explicit labels:

- **Observed public data:** directly reported estimate or resource location.
- **Derived measure:** calculation from observed data.
- **Association:** statistical relationship that does not establish causality.
- **Scenario:** model output under stated assumptions.
- **Recommendation prompt:** a question or option for deliberation, not a directive.

## 4. No false precision

- Round values according to source precision.
- Do not show eight decimal places.
- Do not display an exact rank without uncertainty when ranks are unstable.
- Prefer “top decile with 72% probability” over “ranked 6th” when uncertainty supports the former.
- Clearly distinguish estimate vintage from retrieval date.

## 5. Every claim has an evidence object

Generated content must be assembled from structured claim objects rather than untraceable strings.

Recommended schema:

```json
{
  "claim_id": "claim_...",
  "claim_type": "observation | derived | association | scenario | recommendation_prompt",
  "text": "...",
  "metric_ids": ["..."],
  "geography_ids": ["..."],
  "period": "...",
  "value": 0,
  "unit": "...",
  "comparison": "...",
  "uncertainty": "...",
  "method_version": "...",
  "evidence_refs": ["..."],
  "limitations": ["..."],
  "generated_at": "..."
}
```

A report sentence must not be exportable unless its evidence references resolve.

---

# Terminology standards

Use these preferred terms consistently.

| Preferred term | Meaning | Avoid or qualify |
|---|---|---|
| priority screen | a tool for deciding where deeper review may be useful | risk prediction, allocation engine |
| county-relative percentile | position relative to other county geographies | score without a comparison |
| modeled travel time | network/model estimate | actual patient travel time |
| mapped resource | resource present in the integrated source inventory | all available resources |
| public-data estimate | estimate from a documented public source | exact truth |
| confidence interval / margin of error | source uncertainty | error bar without definition |
| rank stability | consistency under uncertainty or weight changes | robustness without method |
| intervention fit | alignment between observed conditions and a policy option | predicted impact |
| scenario result | output under explicit assumptions | forecast or guaranteed benefit |
| utilization context | aggregated HCAI pattern | individual behavior |
| evidence-backed question | question tied to a documented finding | policy conclusion |

---

# Microcopy rules

## Score labels

Never show only “Score 87.” Use:

```text
Priority estimate
87th county percentile
High relative priority · moderate rank stability
```

Include an adjacent “How this works” control.

## Uncertainty

Examples:

```text
Likely range: 78th–92nd percentile
72% probability of remaining in the top decile
```

When uncertainty is unavailable:

```text
Uncertainty could not be estimated from this source. Treat comparisons as approximate.
```

## Missing source

```text
This source is temporarily unavailable. The platform is showing the last verified snapshot from [date]. It has not substituted another source.
```

## Suppressed data

```text
The source suppressed this value to protect confidentiality or because the estimate was unstable. It is not treated as zero.
```

## Scenario result

```text
Modeled scenario, not a causal prediction. Results depend on candidate sites, travel assumptions, capacity, and the selected objective.
```

## Resource gap

```text
Resource access is based on the mapped inventory and modeled travel thresholds. Unmapped, newly opened, restricted, or capacity-limited services may change the interpretation.
```

## Validation

```text
This result tests whether the priority measure aligns with an independent public outcome. Alignment supports usefulness but does not prove cause or program impact.
```

---

# Required report types

All reports must be generated from a common evidence model and support HTML, print, and accessible PDF.

## 1. One-page advocacy brief

### Audience

Commissioners, legislative staff, department staff, community advocates, and meeting participants.

### Required structure

1. **Title** — one line, specific geography and issue.
2. **Why this deserves attention** — two to three evidence-backed sentences.
3. **What the data show** — three to five findings with values and uncertainty.
4. **Where the need appears concentrated** — map or ranked geography summary.
5. **What may explain the pattern** — top drivers and resource/access context.
6. **What remains unknown** — limitations, missing data, and community knowledge needed.
7. **Questions for staff** — three to five precise questions.
8. **Potential next steps for discussion** — options, not mandates.
9. **Sources and methods** — compact citations, vintages, and methods version.
10. **Use statement** — decision support, not clinical or causal conclusion.

### Maximum length

- One printed page whenever possible.
- A second page may be used only for sources/methods.

## 2. Geography profile

Required sections:

- geography identity and population context;
- strongest health indicators;
- strongest access barriers;
- environmental/context conditions;
- resource and travel access;
- utilization context;
- comparison with county, peer geographies, and selected district;
- uncertainty and data quality;
- trend where available;
- top evidence-backed questions;
- complete metric table appendix.

## 3. Intervention scenario brief

Required sections:

- policy question;
- baseline;
- selected intervention type;
- candidate locations or populations;
- model objective and constraints;
- scenario result;
- populations/geographies reached;
- distributional equity effects;
- sensitivity analysis;
- operational assumptions;
- what is not modeled;
- data needed before implementation;
- comparison with alternative scenarios.

Never call modeled reach “people served” unless service capacity and uptake are modeled and validated. Prefer “residents within the modeled travel threshold.”

## 4. Staff-question packet

Organize questions by:

- data clarification;
- service availability;
- geographic targeting;
- equity and language access;
- implementation capacity;
- accountability and measurement;
- budget and resource allocation;
- community engagement;
- contradictory evidence.

Every question should include a short evidence note and source.

Example:

> **Question:** What explains the difference between comparatively high diabetes burden and the limited number of mapped clinical-care resources reachable within 30 minutes in the selected area?
>
> **Evidence note:** [metric values, uncertainty, source/vintage]. The mapped inventory may omit some services, so staff confirmation is needed.

## 5. Public-comment outline

Structure:

1. identity/connection to the issue;
2. one clear request;
3. two or three verified facts;
4. community impact stated without stereotyping;
5. acknowledgement of uncertainty;
6. specific action or question;
7. closing sentence.

The system must not fabricate personal experience or claim to represent a community.

## 6. Validation summary

Include:

- hypothesis;
- independent outcome;
- analysis population/geography;
- method;
- result and interval;
- spatial diagnostics;
- sensitivity;
- limitations;
- implication;
- what the result does not prove.

Show null findings as prominently as positive findings.

## 7. Evidence packet

A machine- and human-readable appendix containing:

- every claim object;
- source metadata;
- raw and transformed values;
- uncertainty;
- formulas;
- source snippets for uploaded documents;
- chart data;
- map layer metadata;
- generation version;
- reproducibility instructions.

---

# Required UI writing patterns

## Overview hero

Use a restrained, practical message. Example:

> **Find where health needs, access barriers, and service gaps overlap.**
>
> Explore public data, test transparent scenarios, and build evidence-backed questions for Santa Clara County advocacy and planning.

Do not use hype such as “revolutionary AI,” “perfect allocation,” or “predicts the future.”

## Guided start

Provide three first actions:

- **Explore a community** — understand conditions and drivers.
- **Compare priorities** — rank geographies under a transparent lens.
- **Prepare for a meeting** — turn evidence into questions and a brief.

## Geography summary

Use this hierarchy:

1. plain-language takeaway;
2. confidence/quality badge;
3. raw values;
4. comparison;
5. top drivers;
6. available actions;
7. methods and sources.

## Driver explanation

For each driver show:

```text
Metric name
Raw value + unit
County comparison
Contribution to selected lens
Uncertainty or quality
Why it matters
Source and vintage
```

“Why it matters” must be a neutral explanation, not a causal claim.

## Intervention comparison

Use a table/card set with:

- option;
- intended problem addressed;
- observed alignment;
- modeled reach/access effect;
- evidence strength;
- assumptions;
- operational data needed;
- risks and tradeoffs.

Avoid a single winner without showing tradeoffs.

---

# Citation standards

## Public data citation

Each metric citation must include:

- publisher;
- dataset/product;
- metric/table/field;
- data vintage;
- retrieval date;
- geography;
- stable source URL or identifier;
- transformation/method version.

## Document citation

Include:

- document title;
- issuing body;
- meeting/report date;
- page or section;
- exact document URL or internal document ID;
- a short supporting excerpt within copyright limits;
- extraction confidence when OCR was required.

## AI-generated output

The copilot must return citations as structured objects. The frontend must render citations adjacent to the claims they support. Do not place one generic source list at the end of a long answer and imply that it supports every sentence.

---

# Readability and tone

- Target plain language suitable for a general civic audience.
- Define technical terms on first use.
- Use active voice.
- Prefer short paragraphs and meaningful headings.
- Do not oversimplify uncertainty.
- Avoid bureaucratic filler.
- Avoid alarmist language.
- Avoid “we know” when the evidence only suggests.
- Do not call a percentile a percentage of people.
- Do not confuse prevalence, count, rate, and risk.

## Required automated content checks

Create tests or lints for:

- “causes,” “will reduce,” “guarantees,” or similar causal language in derived/scenario outputs;
- missing citations;
- missing source vintage;
- percentile/percentage confusion;
- missing uncertainty labels;
- suppressed values rendered as zero;
- overlong executive summaries;
- jargon without glossary terms;
- missing use/limitation statement in exports.

---

# Localization and language access

The architecture must support localization. English may be the initial complete language, but:

- UI strings must not be hard-coded throughout components;
- reports must be generated from structured content blocks;
- machine translation must be labeled and reviewed before official use;
- numbers, dates, and units must be locale-aware;
- language-access insights must never infer an individual’s language from tract demographics;
- the tool should support future Spanish, Vietnamese, Chinese, and other locally relevant translations through reviewed catalogs.

---

# Accessible report requirements

- semantic heading hierarchy;
- tagged PDF where tooling supports it;
- readable table headers;
- alternate text for charts/maps;
- text summary equivalent to visual findings;
- sufficient contrast;
- no color-only meaning;
- page numbers and repeated report title;
- source links written meaningfully;
- selectable text;
- minimum readable print font size;
- no clipped content at common paper sizes.

---

# Report QA checklist

Before export:

- [ ] Geography, period, and comparison group are explicit.
- [ ] Every number has a unit.
- [ ] Every claim resolves to evidence.
- [ ] Uncertainty and quality are visible.
- [ ] Observed, derived, associated, and scenario claims are labeled.
- [ ] No suppressed value is treated as zero.
- [ ] No causal statement exceeds the evidence.
- [ ] The report states what is unknown.
- [ ] Staff questions are specific and answerable.
- [ ] Community language is respectful.
- [ ] The output is accessible in print and screen-reader review.
- [ ] Methods version and generation date are present.
- [ ] Export values exactly match the underlying analytics response.

