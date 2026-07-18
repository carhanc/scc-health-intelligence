// Single source of truth for term definitions shown via <GlossaryTerm>
// (@scc-health/ui) -- each definition is written once here and reused
// everywhere the term appears, rather than redefined ad hoc per page.
// Wording follows docs/design/content-style-guide.md (short sentences,
// no internal identifiers, non-causal framing where relevant).

export const GLOSSARY = {
  combinedConcernScore:
    "A 0-100 county-relative screening score combining this scenario's weighted domains. A high score means this tract's profile warrants a closer look, not a prediction or a causal claim.",
  countyRelative:
    "Compared only to other Santa Clara County census tracts, not to state or national figures.",
  stabilityLabel:
    "How much a tract's rank changes when the scoring weights are re-tested under randomized alternative priorities.",
  dataCoverage:
    "The share of this scenario's weighted metrics that had usable data for this tract. Below a set threshold, no score is shown at all rather than one built from too little data.",
  modeledEstimate:
    "A distance or travel time calculated from road/transit network data, not a measured or reported real-world observation.",
  scenario:
    "A named set of priority weights across health, access, environment, and resource domains -- changing it re-ranks tracts under a different combination of concerns.",
  healthEquity:
    "Health equity means everyone has a fair and just opportunity to attain their highest level of health (CDC).",
  censusTract:
    "A small, relatively permanent statistical subdivision of a county defined by the U.S. Census Bureau, roughly 1,000-8,000 residents -- the smallest geography this platform scores.",
  percentile:
    "Where a value ranks compared to every other Santa Clara County tract, from 0 (lowest) to 100 (highest) -- \"higher than 75% of tracts\" means only a quarter of tracts have a higher value.",
  driver:
    "A specific measure that contributed points to this tract's combined score -- how much it contributed depends on both its own value and how heavily this scenario weights its domain.",
  confidence:
    "How complete and precise the underlying data is for a tract's score -- separate from stability, which is about how much a rank shifts under different priority weightings.",
};

export type GlossaryKey = keyof typeof GLOSSARY;

// The data_status plain-language definitions previously lived here as a
// 3-value map, but the real backend also returns a 4th value ("derived"),
// found live during the Advocate redesign pass -- superseded by
// dataStatusDefinition/dataStatusLabel in @/lib/advocacy-terms.ts, the
// one place this concept is now defined, to avoid two incomplete,
// independently-drifting copies of the same mapping.
