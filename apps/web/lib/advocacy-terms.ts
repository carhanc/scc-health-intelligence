// Central plain-language terminology for the Advocate workspace and every
// "Use in Advocate" entry point (docs/design/advocate-intuitive-workspace-
// research.md §6). Internal names (AdvocacyWorkspace, workspaceId,
// evidence_id, IndexedDB store names, the exported .json file's shape) are
// UNCHANGED -- this module governs user-facing text only, so a future page
// can't reintroduce old jargon by writing its own ad hoc string.

export const ADVOCACY_TERMS = {
  /** The noun used everywhere a user-facing label needs it. Internal type
   * name `AdvocacyWorkspace` and the `workspaceId` field are unchanged. */
  projectNoun: "project",
  projectNounCap: "Project",
  newProjectCta: "Start a new project",
  defaultProjectTitle: "New advocacy project",

  /** The four visible guided stages, in order (flow-simplification pass --
   * "Project" is deliberately not a separate stage; place+focus selection
   * both live inside "Place"). */
  stagePlace: "Place",
  stageEvidence: "Evidence",
  stageCreate: "Create",
  stageReview: "Review",

  evidenceSectionHeading: "Evidence for this project",
  evidenceSelectedHeading: "Evidence you're using",
  evidenceAvailableHeading: "More evidence you could add",
  evidenceCountSuffix: (n: number) => (n === 1 ? "1 fact selected" : `${n} facts selected`),
  recommendedFactsHeading: "Recommended facts",
  seeMoreEvidenceCta: "See more evidence",
  continueWithFactsCta: (n: number) => (n === 1 ? "Continue with 1 fact" : `Continue with ${n} facts`),
  selectAtLeastOneFactNote: "Select at least one fact to continue.",
  addedFromPrefix: "Added from",

  whatToCreateQuestion: "What would you like to create?",
  whoIsThisForQuestion: "Who is this for?",
  whatShouldItAccomplishQuestion: "What would you like this document to accomplish?",
  seeMoreDocumentTypesCta: "See more document types",

  createDraftCta: "Create draft",
  draftNoun: "Draft",
  recreateDraftCta: "Create a new version",

  findEvidenceInDocumentHeading: "Choose a document",
  chooseDocumentExplainer:
    "We'll look for passages that may be relevant. The document is processed temporarily and is not saved.",
  reviewDocumentCta: "Choose a file to upload",
  relevantPassagesHeading: "Review useful passages",
  noRelevantPassages:
    "We didn't find a clearly relevant passage. You can try another document or continue with evidence from the platform.",

  downloadBackupCta: "Download a copy",
  restoreBackupCta: "Open a saved copy",
  backupHelpText: "Use this to move the project to another browser or device.",
  restoreHelpText: "Choose a project file previously downloaded from Advocate.",
  invalidBackupError: "This file isn't a valid Advocate project file.",
  unparseableBackupError: "This file isn't a valid Advocate project file. It couldn't be read as a project file at all.",
  nothingChangedNote: "Nothing was changed.",

  savedOnDevice: "Saved on this device",
  saving: "Saving…",
  couldNotSave: "Couldn't save",
  storageUnavailable: "Browser storage unavailable",
  storageHelpText:
    "This project is stored in this browser. Download a copy if you need to move it to another device or if this browser's storage isn't available.",

  projectOptionsMenu: "Project options",
  renameCta: "Rename project",
  duplicateCta: "Duplicate project",
  switchProjectCta: "Switch project",
  deleteCta: "Delete project",
  viewProjectDetailsCta: "View project details",
  hideProjectDetailsCta: "Hide project details",
  changeCta: "Change",

  causalCaveat:
    "This draft organizes screening evidence. It does not prove causation or make a final policy decision.",
} as const;

/** Plain-language rewrite of the raw `data_status` API value shown on an
 * evidence card and in generated drafts -- never the bare word "modeled,"
 * "observed," or "derived" as if it were already plain English. Four
 * real backend values exist (confirmed live, not just from the type
 * definition): "derived" is used for averaged/composite evidence (a
 * value averaged across multiple tracts, or the health equity screening
 * score itself) and is genuinely distinct from a single-source "modeled"
 * estimate. */
const DATA_STATUS_LABELS: Record<"observed" | "modeled" | "suppressed" | "derived", string> = {
  observed: "Reported measurement",
  modeled: "Modeled estimate",
  suppressed: "Withheld by source",
  derived: "Calculated estimate",
};

export function dataStatusLabel(status: "observed" | "modeled" | "suppressed" | "derived"): string {
  return DATA_STATUS_LABELS[status] ?? status;
}

const DATA_STATUS_DEFINITIONS: Record<"observed" | "modeled" | "suppressed" | "derived", string> = {
  observed: "Directly reported or measured by the source, not calculated by this platform.",
  modeled: "Calculated by this platform from other data, not a direct measurement.",
  suppressed: "Withheld by the source (often to protect privacy for small counts), not a real zero.",
  derived: "A calculated summary combining more than one underlying fact, such as an average across tracts.",
};

export function dataStatusDefinition(status: "observed" | "modeled" | "suppressed" | "derived"): string {
  return DATA_STATUS_DEFINITIONS[status] ?? "";
}

/** Plain-language cross-page call-to-action, used by every "Add to
 * advocacy project" entry point (Explore, Prioritize, Access Lab,
 * Utilization). One consistent label everywhere -- Utilization previously
 * overrode this to a bare "Use" to avoid colliding with a column-sort
 * button of a similar name; the redesigned label is unambiguous enough
 * that no override is needed. */
export const ADD_TO_ADVOCACY_PROJECT_CTA = "Add to advocacy project";

/** Confirmation shown once evidence has actually landed in a project --
 * plain language, states what was added and where it came from, never
 * "N evidence records serialized successfully." */
export function addedToProjectConfirmation(count: number, placeLabel: string): string {
  const noun = count === 1 ? "fact" : "facts";
  return `Added ${count} ${noun} about ${placeLabel} to your advocacy project.`;
}
