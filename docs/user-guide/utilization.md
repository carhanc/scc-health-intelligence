# Using the Utilization page

Utilization shows how Santa Clara County residents actually use emergency-department care — a real, observed complement to Prioritize's and Explore's screening scores. Figures here are **observed** counts at their real published geography (county, facility, or patient ZIP code) unless a table is explicitly labeled **modeled** — this platform never claims to have observed tract-level utilization, since the public data does not go that granular.

## Facility view

Every Santa Clara County hospital that reports emergency-department data to the state, with its licensed-bed band, trauma-center level, and total 2024 ED encounter count. Select a facility to see its real payer mix, disposition pattern (routine discharge, died, transferred to psychiatric care, and more), and language breakdown. A blank value in the breakdown means that specific cell was masked in the source for small-number privacy protection — not that the true count is zero.

Licensed beds and total ED encounters are shown side by side as a **capacity-versus-demand comparison**, not an occupancy rate — no public data source reports how full a facility's beds actually are on any given day, so this platform does not claim to know.

## Geographic view

Two separate tables, deliberately never merged:

- **Observed, by patient ZIP code** — the real geography HCAI actually publishes patient-origin data at.
- **Modeled, by census tract** — HCAI does not publish tract-level ED data at all. This table allocates the real ZIP-level counts down to tracts by land area, using the same crosswalk method used elsewhere on this platform. Every row states its allocation method and a confidence label.

A small number of large, sparsely-populated tracts produce an unreliable allocation (their modeled rate is flagged **"Unreliable estimate — do not use"** in red) — this is a known limitation of area-based allocation, not a data-entry error, and the platform tells you exactly which tracts are affected rather than hiding them or presenting them as ordinary. "Top 10% modeled use" flags the highest-use tracts among the reliable ones only.

## Trends over time

A real, observed time series of Santa Clara County emergency-department encounters, 2008-2024, by disposition, race group, sex, or expected payer — switch between them with the buttons above the table. This is the one utilization view that is genuinely native to the county as a whole; it is never broken down to a smaller geography, since the source data doesn't support that. A masked (suppressed) year/category combination shows a "Suppressed (small count)" label, never a zero.

## What Utilization cannot tell you

- Real tract-level observed ED counts — no public source publishes them; the tract-level table is a disclosed, area-weighted estimate, not an observed figure.
- Whether a facility is over capacity or operating near its limit — no public data reports actual bed occupancy.
- Whether a facility's service-area overlap with a neighboring facility means duplicated or competing coverage — for a facility's real travel-time catchment, see the Access Lab.
- Whether higher modeled utilization in a place is caused by worse access, worse health, or something else — the Utilization and Validate pages together let you compare the two, but neither establishes cause and effect.
