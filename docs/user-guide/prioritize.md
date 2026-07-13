# Using the Prioritize page

Prioritize flips Explore's question around. Instead of "look up a place, see its picture," it asks "given a specific priority (or one you set yourself), which places does the data suggest looking at first?"

## Choosing a priority

The "Scenario" panel lists 8 named priorities (Balanced overview, Diabetes prevention, Mobile or transit-linked care, Coverage navigation, Older-adult support, Behavioral-health access, Food access, Environmental burden), each a different, disclosed weighting of the same five underlying factors. Selecting one immediately updates the ranked results — nothing is hidden behind a separate "apply" step.

**Language access** is shown as a real, explained "not available yet" option, not hidden and not faked: no data source in this platform currently measures language barriers at the neighborhood level, so building a scenario for it would mean reweighting unrelated factors under a misleading label. Coverage navigation or a custom scenario are the closest available substitutes.

## Setting your own weighting

Choose "Custom scenario" to reveal five sliders, one per factor. Move any slider to say how much that factor should matter — the percentages shown always add up to 100%, recalculated live from all five sliders together, so you never need to manually rebalance them yourself. "Reset to equal weights" returns every factor to 20%.

A custom weighting shows a combined score and its data coverage, but not the full uncertainty picture (Monte Carlo ranges, stability labels) — those are only pre-computed for the 8 named scenarios, since they can't be pre-computed for every possible custom weighting in advance. Pick the closest named scenario if you want to see that detail.

## Reading the ranked results

The results table ranks every scored place by its combined priority score under the current scenario or weighting, with its data-coverage percentage and (for named scenarios) a stability badge showing how much that ranking depends on the exact weighting used. Click "Show drivers" on any row to see which factors are pushing that place's score up, and a link to Explore's full evidence view for every underlying source and measure.

A place with too little data to compute a combined score is excluded from the ranking, not shown with a score of zero.

## Site & program constraints

This tab shows the same pre-computed mobile-clinic siting scenarios as the Access Lab — different numbers of sites, different distance thresholds, with and without an equity requirement. These are modeled planning explorations, not a live, freely-adjustable solver; a scenario showing "no solution satisfies these constraints" is a real, informative result.

## Comparing two priorities

Choose a second scenario in the Compare tab to see which places rank in the top 10 under both, only the first, or only the second — a quick way to see whether a recommendation is robust across different priorities or specific to one lens.

## Exporting

**Download CSV** gives every scored place's combined score, data coverage, and domain-level breakdown under the current scenario or weighting. The **decision memo** is a printable, evidence-backed summary — top-ranked places, the weighting used, methodology, limitations, and sources — with a "Print / save as PDF" button. Neither export makes a savings or causal claim; both explicitly state this is a screening tool, not a guarantee of program impact.

## What Prioritize cannot tell you

- Whether any specific intervention would actually help a high-ranked place — a high score identifies a place for closer investigation, not a validated solution.
- An individual-level risk estimate for anyone living in a ranked place.
- A guaranteed outcome from following any of the site/program constraint scenarios — they describe a possible configuration to explore, not a decided plan.
