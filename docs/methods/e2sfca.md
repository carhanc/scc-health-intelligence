# E2SFCA (Enhanced Two-Step Floating Catchment Area) Methodology (Phase 6)

Status: Phase 6, implemented, unit-tested against hand-calculated examples, live-verified, audited. Implements docs/03 §12.5.

## 1. What E2SFCA measures

Straight-line or network distance to the *nearest* facility answers "how far is the closest option." E2SFCA answers a different, complementary question: "considering both nearby services and how much competing local demand is close to them too, how much access does this population point have overall?" A population point near one facility that also serves a large nearby population has *less* effective access than an identical point near a facility with little competing demand, even at the same raw distance.

## 2. The two-step formula

**Step 1 (per facility j):**

```
R_j = S_j / sum_k( P_k * W(d_kj) )
```

`R_j` is facility j's supply-to-demand ratio: its capacity `S_j`, divided by the demand-weighted sum of every population point k within its catchment (each weighted down by distance decay `W`).

**Step 2 (per population point i):**

```
A_i = sum_j( R_j * W(d_ij) )
```

`A_i`, the point's total accessibility score, sums every facility j within its catchment's contribution — its supply ratio, discounted by distance again.

## 3. Distance decay

A Gaussian kernel, zero beyond the catchment radius (a hard cutoff, not just an asymptotic fade) — a standard, well-documented choice in the accessibility literature (e.g. Dai 2010), not this project's own invention:

```
W(d) = exp(-d^2 / (2 * sigma^2))   for d <= catchment_radius, else 0
```

## 4. Parameters used (disclosed, not tuned to a result)

| Mode | Catchment radius | Sigma |
|---|---|---|
| walk | 2.0 mi | 1.0 mi |
| drive | 15.0 mi | 7.5 mi |

Conventional magnitudes for primary/acute clinical-care access (walk: a walkable-care catchment; drive: a ~20-30 minute suburban/rural drive), chosen once and recorded here (DEC-048).

## 5. Capacity policy: real where available, count-proxy where not

Per this project's non-negotiable rule, capacity must never be inferred from facility type alone:

- **Hospitals** (`capacity_type="real_capacity"`): `S_j` = HCAI's real `licensed_beds` field, live-verified populated for all 15 Santa Clara County hospitals.
- **Clinics** (`capacity_type="count_proxy"`): no comparable real capacity field exists in any ingested source, so `S_j = 1` for every clinic — a standard, disclosed facility-count proxy.

The two are always computed as separate category rows and **never mixed within a category** (audited: `audits/access_metrics_audits.py::e2sfca_capacity_type_consistent_within_category`).

## 6. Live results

4,692 `analytics.e2sfca_accessibility` rows (1,173 origins × 2 modes × 2 categories), all non-negative, all correctly labeled. A real, plausible finding: walk-mode hospital accessibility is 0.0 for 903 of 1,173 origins (77%) — given only 15 hospitals exist county-wide and a 2-mile walk catchment is tight, this is expected, not a bug (drive-mode hospital accessibility is 0.0 for only 2 origins, consistent with the much larger 15-mile catchment).

## 7. Known limitations

- E2SFCA describes relative accessibility, not an absolute measure of adequacy — a low score does not mean "insufficient care," only "low relative to the rest of the county under these parameters."
- Catchment radius and sigma are one disclosed, defensible choice; different values would shift results (this is exactly what the resource-gap stability assessment, `accessibility.md` §5, is designed to surface).
- Inherits every limitation of the underlying distance method (real network routing — see `routing.md`).
