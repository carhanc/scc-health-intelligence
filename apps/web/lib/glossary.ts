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
};

export type GlossaryKey = keyof typeof GLOSSARY;
