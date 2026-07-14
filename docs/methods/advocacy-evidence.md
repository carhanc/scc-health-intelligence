# Advocacy Evidence Assembly Methodology (Phase 8)

Status: Phase 8, implemented, unit- and API-tested, live-verified.

## 1. What this module answers, and what it doesn't

Advocate, Document Intelligence's evidence-matching, and Copilot all need the same thing: a geography's worth of this platform's existing evidence, packaged into one common, fully-cited shape. `advocacy_evidence.py`'s `assemble_evidence()` answers "what does this platform already know about this place" — it computes nothing new. Every value returned comes from an already-computed, already-tested `analytics.*` or `resources.*` warehouse table (the same DEC-030 read-only-presentation-layer boundary every other Phase 8 API route follows). If a number isn't already sitting in a warehouse table, Advocate cannot show it.

## 2. The `EvidenceItem` shape

Every piece of evidence this platform surfaces for advocacy — a metric, a scenario score, an access measure, a utilization estimate, or a resource count — is returned as the same `EvidenceItem` object, carrying: `evidence_id`, `category`, `label`, `value` (a formatted display string) and `raw_value` (the underlying number), `unit`, geography type/id/label, `data_status` (`observed` / `modeled` / `derived` / `suppressed`), `publisher`, `source_vintage`, `retrieved_at`, `method`, `uncertainty_note`, `limitation`, `citation`, and `source_url`. This single shape is what lets Advocate's evidence cards, Document Intelligence's claim-matching, and Copilot's citation validation all speak the same language without three separate implementations.

## 3. City/ZIP/district geography is an averaged aggregate, not a real single-tract figure

This platform's scores and most metrics are computed **per census tract** — there is no independently-computed score for a city, ZIP code, or supervisor district. When a user picks one of those broader geographies, `resolve_member_tracts()` finds every member tract (via the existing, already-audited `geo.tract_place_assignment`, `geo.tract_supervisor_district_assignment`, and `geo.crosswalk_zip_tract` tables — no new crosswalk was built for this), and evidence for that geography is a disclosed **unweighted average across those member tracts**.

This average is always labeled as such — `data_status: "derived"`, a `method` of `unweighted_average_across_member_tracts`, and a value string like "12.4% (average across 8 of 9 tracts)" that discloses both the averaging and any missing-tract coverage gap. It is never presented as if it were a single tract's real, directly observed figure. A full population-weighted place-level re-aggregation (which would better reflect where within a city or district people actually live) was considered and deliberately scoped out of Phase 8 — see `DECISIONS.md`.

A geography that resolves to zero member tracts (a nonexistent or malformed ID) returns **no evidence at all**, not a county-wide fallback — that fallback exists only inside `build_resource_evidence()`, and only for a real geography that simply has no assigned city (see the `assemble_evidence()` docstring and its regression test, `test_evidence_bundle_unknown_tract_is_404`).

## 4. What each evidence category draws from

| Category | Source table | `data_status` |
| --- | --- | --- |
| `metric` | `analytics.metric_contributions` | `observed` (single tract) / `derived` (aggregate) |
| `scenario_score` | `analytics.scenario_scores` | `derived` |
| `access` | `analytics.e2sfca_accessibility` | `derived` |
| `utilization` | `analytics.utilization_access_vs_utilization` | `modeled` |
| `resource` | `resources.canonical_facilities` | `observed` |

`metric` and `scenario_score` evidence is only built when a scenario/priority lens is selected — a raw metric list with no scenario context does not, by itself, tell you which score it feeds into.

## 5. Resource evidence's fallback scope

`build_resource_evidence()` counts real, deduplicated facility inventory by category, filtered to the geography's own city when one is known. When no city can be determined (rare — mainly for a supervisor district or ZCTA with an ambiguous or missing place assignment), it falls back to a **county-wide** count, explicitly labeled `scope_label = "Santa Clara County"` rather than silently presented as if it were local. This is a disclosed proximity approximation, not a real "resources near you" claim — see `docs/methods/e2sfca.md` and the Access Lab resource browser for the real network/transit-distance-based analysis.

## 6. Reproducibility

Every generated advocacy output includes a `configuration_hash` — a SHA-256 hash of the geography ID, scenario ID, sorted evidence IDs, and audience that produced it (`advocacy_generation.configuration_hash()`). Two outputs sharing the same hash were built from exactly the same inputs; this lets a commissioner or staff member verify that a brief they're reading matches a specific, reproducible configuration rather than an opaque one-off.

## 7. Known limitations

- Aggregate (city/ZIP/district) evidence is an unweighted average across member tracts, not population-weighted — a large, sparsely-populated tract and a small, dense one currently count equally.
- Resource evidence is an inventory count, not a real-time capacity, appointment-availability, or insurance-acceptance signal.
- `utilization` evidence inherits every limitation of the underlying ZIP-to-tract allocation model (`docs/methods/utilization.md`), including the disclosed `rate_reliability` flag for a small number of tracts where area-weighting produces implausible rates.
