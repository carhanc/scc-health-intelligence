# Real Network Routing Methodology (Phase 6)

Status: Phase 6, implemented, live-verified, audited. Implements docs/04 §11's `OSMNetworkProvider`.

## 1. Engine choice

OSMnx + NetworkX (DEC-043), not a server-oriented router (R5, OpenTripPlanner), which were judged out of proportion to this phase's remaining time budget within a single session. This is a genuine tradeoff, not a free lunch — see §5 for what it costs.

## 2. Graph construction

`pipelines/src/scc_health_pipeline/run_build_network_graphs.py` downloads the full Santa Clara County street/path network from OpenStreetMap via the Overpass API for two network types, cached to `data/raw/osm_network/{mode}_graph.graphml` with a sha256 checksum and a `DATA_MANIFEST.json` entry (`source_id=osm_overpass_network`):

| Mode | Nodes | Edges | Live download time |
|---|---|---|---|
| drive | 45,836 | 109,872 | 38-148s |
| walk | 277,444 | 788,154 | 171-194s |

The full county was used, not a bounding box around only currently-loaded facilities/origins — a live-tested scope decision (DEC-046), not an assumption.

### Speed assumption (a real bug found and fixed)

The drive graph uses OSMnx's own free-flow speed imputation from OSM `maxspeed` tags and highway-type defaults — appropriate for a car. The walk graph does **not** use this (a real defect was found: the vehicle-oriented imputation applied to a walk graph implied ~22 mph "walking," caught via a live sanity check computing implied speed in mph on a real route). The walk graph instead assigns a constant 5 km/h (~3.1 mph, the standard pedestrian-accessibility-research convention) to every edge, re-verified live (a real 4.03-mile-straight-line route computed to a 3.11 mph implied pace).

## 3. Routing API

`pipelines/src/scc_health_pipeline/routing/network_osm.py`:

- `route_between_points(...)` — single origin-destination shortest path, by real network distance (`length` edge attribute, meters) and, where the graph carries a `travel_time` attribute, real duration too.
- `shortest_distances_from_origin(...)` — one-to-many, via a single Dijkstra run per origin (not one per destination) — the efficient form used for population-origin-to-many-facilities batch computation.

Every result is a typed `NetworkRouteResult` with `status: "routed" | "unavailable"`. A routing failure (no connected path, a point too far from any routable node to snap sensibly) never raises and never silently falls back to a different method — it returns `status="unavailable"` with a stated reason, exactly the "advanced route unavailable; screening distance available" pattern this project's spec requires. `method` is always `osm_network_walk` or `osm_network_drive`, distinct from `routing.straight_line.METHOD_LABEL` ("straight_line_screening") — a network-routed result is never presented as a screening estimate or vice versa.

## 4. Performance: batching is required at county scale

A real performance defect was found and fixed during live verification: snapping each of 3,000+ destination points to the graph individually (calling OSMnx's single-point `nearest_nodes()` once per point) rebuilds its spatial index every call and does not scale — it looked identical to a hang against the 277k-node walk graph. Fixed with a `nearest_nodes_batch_fn` parameter that snaps all destinations in one vectorized call, plus a straight-line pre-filter (network distance is always ≥ straight-line distance, so filtering candidates by straight-line distance before any network snapping only removes points that could never have been within the network cutoff — pure performance, no coverage loss). Post-fix: ~0.3-2.2s per origin depending on mode and destination-set size.

## 5. Known limitations

- **Free-flow driving only** (RISK-024): no time-of-day or traffic-congestion modeling. Out of scope for a keyless, locally-reproducible pipeline (this project's "no paid API keys" requirement).
- **No R5/OpenTripPlanner-grade multi-modal routing** — transit is handled by a separate schedule-based proxy (`transit-access.md`), not blended into the same graph.
- Every result is a straight-line-screened, network-routed **estimate**, not a real-time route service; it does not account for road closures, construction, or live conditions.
