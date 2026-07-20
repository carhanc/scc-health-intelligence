// The real, existing output types and audiences (docs/design/advocate-
// intuitive-workspace-research.md §"output selection" -- no invented
// types; this is the actual list the backend supports). Shared between
// the landing page's preview cards, the "What do you want to create?"
// picker, and the draft preview.

export interface OutputTypeOption {
  id: string;
  label: string;
  /** One plain-language sentence shown on the picker card. */
  description: string;
}

export const OUTPUT_TYPES: OutputTypeOption[] = [
  {
    id: "one_page_brief",
    label: "One-page meeting brief",
    description: "A concise overview for a meeting or to share by email.",
  },
  {
    id: "detailed_memo",
    label: "Detailed advocacy memo",
    description: "A fuller written case, with sources and next steps.",
  },
  {
    id: "staff_questions",
    label: "Commissioner / staff question list",
    description: "A short list of questions to bring into a meeting.",
  },
  {
    id: "public_comment",
    label: "Public-comment talking points",
    description: "A structured statement for a meeting or public hearing.",
  },
  {
    id: "geography_profile",
    label: "Geography evidence profile",
    description: "A place-by-place summary of the evidence.",
  },
  {
    id: "source_appendix",
    label: "Source and limitation appendix",
    description: "Every source and its limitations, for the record.",
  },
];

/** The 3 most broadly useful real output types, shown first on the
 * simplified Create step -- the other 3 real types are still fully
 * available behind "See more document types," never hidden or removed. */
export const PRIMARY_OUTPUT_TYPE_IDS = ["one_page_brief", "detailed_memo", "public_comment"];

export interface AudienceOption {
  id: string;
  label: string;
}

export const AUDIENCES: AudienceOption[] = [
  { id: "commissioner", label: "Commissioner / staff" },
  { id: "public", label: "General public" },
  { id: "advocate", label: "Fellow advocates" },
];

export function outputTypeLabel(id: string): string | null {
  return OUTPUT_TYPES.find((t) => t.id === id)?.label ?? null;
}
