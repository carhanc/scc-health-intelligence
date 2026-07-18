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

  /** The four guided stages, in order. */
  stageProject: "Project",
  stageEvidence: "Evidence",
  stageDraft: "Draft",
  stageReview: "Review & share",

  evidenceSectionHeading: "Evidence for this project",
  evidenceSelectedHeading: "Evidence you're using",
  evidenceAvailableHeading: "More evidence you could add",
  evidenceCountSuffix: (n: number) => (n === 1 ? "1 fact selected" : `${n} facts selected`),

  whatToCreateQuestion: "What do you want to create?",
  whoIsThisForQuestion: "Who is this for?",
  whatShouldItAccomplishQuestion: "What do you want this document to help accomplish?",

  createDraftCta: "Create draft",
  draftNoun: "Draft",
  recreateDraftCta: "Create a new version",

  findEvidenceInDocumentHeading: "Find useful evidence in a document",
  reviewDocumentCta: "Choose a file to upload",
  relevantPassagesHeading: "Relevant passages",
  noRelevantPassages:
    "We didn't find a passage that clearly matches this project. You can try a different document or add a note manually.",

  downloadBackupCta: "Download project backup",
  restoreBackupCta: "Restore a project backup",
  backupHelpText: "Download a backup to move this project to another browser or device.",
  restoreHelpText: "Choose a project backup previously downloaded from Advocate.",
  invalidBackupError: "This file isn't a valid Advocate project backup.",
  unparseableBackupError: "This file isn't a valid Advocate project backup. It couldn't be read as a backup file at all.",
  nothingChangedNote: "Nothing was changed.",

  savedOnDevice: "Saved on this device",
  saving: "Saving…",
  couldNotSave: "Couldn't save",
  storageUnavailable: "Browser storage unavailable",
  storageHelpText:
    "This project is stored in this browser. Download a backup if you need to move it to another device or if this browser's storage isn't available.",

  projectOptionsMenu: "Project options",
  renameCta: "Rename project",
  duplicateCta: "Duplicate project",
  deleteCta: "Delete project",

  causalCaveat:
    "This draft organizes screening evidence. It does not prove causation or make a final policy determination.",
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
