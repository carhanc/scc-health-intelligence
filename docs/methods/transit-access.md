# Scheduled Transit Access Methodology (Phase 6)

Status: Phase 6, implemented, live-verified, audited. Implements a walk-to-stop + scheduled-frequency proxy per DEC-043/RISK-021 — explicitly **not** a real multi-modal transit router.

## 1. What this measures, and what it does not

`pipelines/src/scc_health_pipeline/routing/transit_access.py` answers: "how good is the scheduled bus/light-rail service at the best stop I could realistically walk to?" It does **not** answer "how long would it take me to ride transit to a specific destination" (that would require modeling transfers, in-vehicle travel time to a specific destination, and real-time delays — a genuine transit router, out of scope this phase). Every result carries `method="scheduled_transit_access_proxy"` and the exact service window it was computed against, so it is never confusable with a live departure board or a guaranteed arrival time.

## 2. Real GTFS data, not a pre-aggregated summary

The warehouse's full VTA GTFS tables (`resources.transit_{stops,stop_times,trips,calendar}`, 427,720 stop-time rows, 3,345 stops) are used directly, not the coarser `transit_stop_frequency_summary` table from Phase 3. For each stop, real scheduled trip counts are aggregated during a fixed weekday daytime window — **07:00-19:00 Monday**, a standard, disclosed accessibility-research convention (not tailored to any specific rider's schedule, and not adjusted for `calendar_dates.txt` exceptions, since none exist in this feed). Headway = window length ÷ trip count, translated into a plain-language service level:

| Headway | Service level |
|---|---|
| ≤ 15 min | frequent |
| ≤ 30 min | regular |
| ≤ 60 min | infrequent |
| > 60 min | minimal |
| 0 trips in window | none |

Live result: 3,214 of 3,241 stops have some weekday-daytime service; the busiest downtown San Jose stops (Santa Clara St & 5th/6th) show ~1.6-2.5 minute headways, a real, plausible finding for a downtown transit-mall corridor.

## 3. Linking a population origin to a stop

`nearest_transit_access()` finds, among stops within a real OSM-network walk distance (not a second straight-line estimate — reuses `routing/network_osm.py`), the stop with the **best** scheduled service, not merely the nearest one — a slightly farther stop with much better frequency is a more useful real-world choice than the closest stop with two buses a day. Ties broken by walk distance. A stop with zero scheduled service in the window is still walk-distance-eligible but never chosen over a serviced stop (`headway is None` sorts last).

## 4. Performance

The same batching/pre-filtering fix as network routing (see `routing.md` §4) is required here too: evaluating one origin against all 3,214 stops via individual node-snapping did not scale; fixed via batched snapping + a straight-line pre-filter (DEC-047). Post-fix: ~1.2-1.5s per origin against the real full stop inventory.

## 5. Known limitations

- **RISK-021**: schedule-based, not real-time — cannot reflect a delayed or cancelled trip, a temporary stop closure, or a service-alert detour.
- Does not model transfers or in-vehicle travel time to any specific destination.
- The 07:00-19:00 Monday window is one disclosed choice; a rider traveling at 9pm or on Sunday would see a different, unmeasured picture.
