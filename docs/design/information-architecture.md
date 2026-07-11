# Information Architecture — Santa Clara Health Intelligence

Status: Phase 0 draft. Nav-grouping specifics (DEC-008) are finalized with browser-review evidence in Phase 5; this document is updated at that point.

## Primary navigation (desktop: persistent left nav; mobile: bottom/drawer nav)

1. **Overview** — orientation, freshness status, three guided starting actions, countywide highlights.
2. **Explore** — map + table geography profiles, metric/lens selection, driver decomposition, peer comparison.
3. **Prioritize** — guided scenario builder, named policy lenses, sensitivity/stability, ranked evidence table.
4. **Access Lab** — resource inventory, travel-time analysis, E2SFCA, mobile-clinic optimizer.
5. **Utilization Lab** — HCAI ED/patient-origin/payer/language context (nav placement per DEC-008: may end up as its own item or a tab under Access Lab, decided in Phase 5).
6. **Validate** — methods explorer, data-quality dashboard, independent validation results, limitations.
7. **Advocate** — brief builder, staff-question generator, evidence packets, exports.
8. **Copilot** — grounded natural-language analytics + document intelligence.
9. **Data** — source catalog, data dictionary, methods, changelog.

Validate and Data remain always visible regardless of the Utilization Lab placement decision, per the explicit instruction not to bury trust features (`docs/01_UX_UI_SPEC.md` §3).

## Persistent global context bar

Present on every analytical page (Explore, Prioritize, Access Lab, Utilization Lab, Validate):

- current geography + comparison group
- selected issue/lens
- data period/vintage
- scenario name (if applicable)
- data freshness status
- share/export controls

Changing any context element updates the page in place without losing the user's location or selections (URL-state-driven).

## Cross-cutting patterns

- **Progressive disclosure everywhere:** plain-language conclusion first → raw value/unit/percentile → drivers → uncertainty → full "How this was calculated" methods drawer, never the reverse.
- **Map + table parity:** every map-based view has a fully equivalent accessible table/list view; no capability exists only on the map.
- **One primary action per view:** no page presents more than one obvious "main" call to action at a time.
- **Search/command pattern:** a persistent geography search (address, tract, ZIP/ZCTA, city, district, community name) is reachable from Overview and Explore.
- **Saved workspace:** local-storage-based, no account required; export/import as JSON.

## Page inventory → route mapping (Next.js App Router, finalized in Phase 5)

```text
/                          Overview
/explore                   Explore (map + drawer)
/explore/compare           Compare mode
/prioritize                Prioritize (scenario wizard)
/prioritize/[scenarioId]   Saved scenario results
/access                    Access Lab
/access/optimize           Mobile-clinic/site optimizer
/utilization               Utilization Lab
/validate                  Validate
/validate/[checkId]        Individual validation result
/advocate                  Advocate workspace
/advocate/documents        Document Intelligence
/copilot                   Copilot
/data                      Data & Methods catalog
/data/[sourceId]           Individual source detail
```

This route list is a Phase 5 implementation target, not yet built.
