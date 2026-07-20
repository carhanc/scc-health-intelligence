import type { AdvocacyEvidenceItem, CopilotAction, EvidenceCategory } from "@/lib/api";

/** The 6 user-facing choices on Copilot's first screen, each mapped to a
 * real backend CopilotAction and (where useful) a real evidence-category
 * filter -- never an invented capability. `list_what_cannot_be_concluded`
 * and `prepare_questions` are genuinely distinct deterministic templates;
 * the others share one generic evidence-summary template in deterministic
 * mode, so their real differentiation comes from which evidence they're
 * actually given, not from separate prose logic. "Compare two places"
 * needs a second community and relabels each item with its place of
 * origin before sending (see buildCompareEvidence below) -- the shared
 * template only prints each item's own label, so without this prefix two
 * places' "Diabetes prevalence" rows would be indistinguishable. */
export type CopilotActionId =
  | "explain_community"
  | "explain_score"
  | "compare_places"
  | "summarize_access"
  | "identify_limitations"
  | "turn_into_questions";

export interface CopilotActionDef {
  id: CopilotActionId;
  label: string;
  description: string;
  backendAction: CopilotAction;
  /** If set, only evidence in these categories is sent -- a genuine,
   * honest narrowing of real evidence, not a different generation path. */
  categoryFilter?: EvidenceCategory[];
  needsSecondPlace?: boolean;
}

export const COPILOT_ACTIONS: CopilotActionDef[] = [
  {
    id: "explain_community",
    label: "Explain a community",
    description: "A plain-language summary of a place's health, access, and resource picture.",
    backendAction: "summarize_geography",
  },
  {
    id: "explain_score",
    label: "Explain what is shaping a screening score",
    description: "See the specific evidence driving a place's screening score under a focus area.",
    backendAction: "explain_prioritization",
    categoryFilter: ["scenario_score", "metric"],
  },
  {
    id: "compare_places",
    label: "Compare two places",
    description: "See two communities' real evidence side by side.",
    backendAction: "summarize_geography",
    needsSecondPlace: true,
  },
  {
    id: "summarize_access",
    label: "Summarize access barriers",
    description: "What the evidence shows about reaching care and other essential resources.",
    backendAction: "summarize_geography",
    categoryFilter: ["access"],
  },
  {
    id: "identify_limitations",
    label: "Identify important limitations",
    description: "What this evidence does not establish, in plain language.",
    backendAction: "list_what_cannot_be_concluded",
  },
  {
    id: "turn_into_questions",
    label: "Turn evidence into questions",
    description: "Draft questions for a meeting, grounded in this place's real evidence.",
    backendAction: "prepare_questions",
  },
];

export function findCopilotAction(id: CopilotActionId): CopilotActionDef {
  const found = COPILOT_ACTIONS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown Copilot action: ${id}`);
  return found;
}

export function filterEvidenceByCategory(
  items: AdvocacyEvidenceItem[],
  categories?: EvidenceCategory[],
): AdvocacyEvidenceItem[] {
  if (!categories || categories.length === 0) return items;
  const filtered = items.filter((item) => categories.includes(item.category));
  // A genuinely empty filter result (this place has no evidence in the
  // requested categories) falls back to the full set rather than sending
  // an empty evidence array -- an honest "nothing narrower to show,
  // here's everything" rather than a confusing empty answer.
  return filtered.length > 0 ? filtered : items;
}

/** Prefixes each item's label with its own real place name so the
 * shared single-place evidence template (which only prints `label`, not
 * `geography_label`) still reads as a genuine two-place comparison, not
 * an ambiguous merged list. Every value, source, and citation stays
 * exactly as returned by the API -- only the display label changes. */
export function buildCompareEvidence(
  placeAName: string,
  placeAEvidence: AdvocacyEvidenceItem[],
  placeBName: string,
  placeBEvidence: AdvocacyEvidenceItem[],
): AdvocacyEvidenceItem[] {
  const relabel = (name: string) => (items: AdvocacyEvidenceItem[]) =>
    items.map((item) => ({ ...item, label: `${name} -- ${item.label}` }));
  return [...relabel(placeAName)(placeAEvidence), ...relabel(placeBName)(placeBEvidence)];
}
