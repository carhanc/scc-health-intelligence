// Versioned Advocacy Workspace schema (Phase 8). Stored entirely
// client-side (IndexedDB) -- no account system, no server persistence,
// no claim of cloud sync. Designed so a future Phase 9 server-persistence
// layer can adopt the identical shape without a rewrite (this file is the
// single source of truth for the shape; storage.ts only knows how to
// read/write it).

import type { AdvocacyEvidenceItem, DocumentAnalysisResponse } from "@/lib/api";

export const WORKSPACE_SCHEMA_VERSION = 1;

export interface SelectedGeographyRef {
  geographyType: string;
  geoid: string;
  displayName: string;
}

export interface WorkspaceConstraints {
  budgetProxy: string | null;
  interventionType: string | null;
  notes: string;
}

export interface UploadedDocumentMeta {
  filename: string;
  fileHash: string;
  analyzedAt: string;
}

export interface MeetingDetails {
  meetingType: string;
  meetingDate: string | null;
}

export interface ExportHistoryEntry {
  outputType: string;
  generatedAt: string;
  configurationHash: string;
}

/** A document passage the user chose to include, via the simplified
 * document flow's per-passage "Include" toggle -- folded into generation
 * as plain notes text (see advocate-client.tsx), never as a fabricated
 * evidence item, since a document passage isn't a sourced, structured
 * fact the way a platform evidence item is. */
export interface IncludedPassage {
  docFilename: string;
  topicId: string;
  topicLabel: string;
  excerpt: string | null;
}

export interface AdvocacyWorkspace {
  workspaceId: string;
  schemaVersion: number;
  title: string;
  /** Whether `title` was set by the user (via rename) or is still the
   * auto-suggested default -- lets the UI keep re-suggesting a better
   * title as place/goal/output change, without ever overwriting a name
   * the user actually chose (docs/design/advocate-intuitive-workspace-
   * research.md §"project naming"). Optional/defaulted for backward
   * compatibility with workspaces saved before this field existed. */
  titleIsUserSet: boolean;
  createdAt: string;
  updatedAt: string;
  selectedGeography: SelectedGeographyRef | null;
  selectedScenarioId: string | null;
  customWeights: Record<string, number> | null;
  constraints: WorkspaceConstraints;
  selectedEvidenceIds: string[];
  evidenceSnapshots: AdvocacyEvidenceItem[];
  uploadedDocuments: UploadedDocumentMeta[];
  documentFindings: DocumentAnalysisResponse[];
  includedPassages: IncludedPassage[];
  userNotes: string;
  targetAudience: string;
  /** Plain-language answer to "What do you want this document to help
   * accomplish?" -- new field, additive-only (see migrateWorkspace: an
   * older saved project or backup without it defaults to ""). */
  projectGoal: string;
  /** The page name a cross-page "Add to advocacy project" click came
   * from (e.g. "Explore", "Access Lab"), or null for a project started
   * directly in Advocate -- lets the Evidence step feature that page's
   * kind of evidence first with a plain "Added from X" label instead of
   * making the user re-find it in an undifferentiated list. Additive,
   * defaults to null for any project saved before this field existed. */
  sourcePage: string | null;
  meetingDetails: MeetingDetails;
  requestedOutputs: string[];
  exportHistory: ExportHistoryEntry[];
  configurationHash: string | null;
}

export function createEmptyWorkspace(title = "New advocacy project"): AdvocacyWorkspace {
  const now = new Date().toISOString();
  return {
    workspaceId: crypto.randomUUID(),
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    title,
    titleIsUserSet: false,
    createdAt: now,
    updatedAt: now,
    selectedGeography: null,
    selectedScenarioId: null,
    customWeights: null,
    constraints: { budgetProxy: null, interventionType: null, notes: "" },
    selectedEvidenceIds: [],
    evidenceSnapshots: [],
    uploadedDocuments: [],
    documentFindings: [],
    includedPassages: [],
    userNotes: "",
    targetAudience: "commissioner",
    projectGoal: "",
    sourcePage: null,
    meetingDetails: { meetingType: "", meetingDate: null },
    requestedOutputs: [],
    exportHistory: [],
    configurationHash: null,
  };
}

/** A human-readable project name suggested from real, structured state --
 * never a raw UUID. Recomputed live as the user fills in place/goal/
 * output, but only ever applied by the caller while `titleIsUserSet` is
 * still false, so a name the user actually typed is never overwritten. */
export function suggestProjectTitle(params: {
  placeLabel: string | null;
  outputTypeLabel: string | null;
}): string {
  const { placeLabel, outputTypeLabel } = params;
  if (!placeLabel) return "New advocacy project";
  if (outputTypeLabel) return `${placeLabel} ${outputTypeLabel.toLowerCase()}`;
  return `${placeLabel} advocacy project`;
}

/** Recovers a workspace from parsed JSON of unknown/older shape --
 * missing fields fall back to empty-workspace defaults rather than
 * throwing, so an old or partially-corrupt export can still be opened
 * (docs' "recover gracefully from invalid or old workspace files"). */
export function migrateWorkspace(raw: unknown): AdvocacyWorkspace {
  const empty = createEmptyWorkspace();
  if (typeof raw !== "object" || raw === null) return empty;
  const candidate = raw as Partial<AdvocacyWorkspace>;

  return {
    workspaceId: typeof candidate.workspaceId === "string" ? candidate.workspaceId : empty.workspaceId,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    title: typeof candidate.title === "string" ? candidate.title : empty.title,
    titleIsUserSet: typeof candidate.titleIsUserSet === "boolean" ? candidate.titleIsUserSet : true,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : empty.createdAt,
    updatedAt: new Date().toISOString(),
    selectedGeography: candidate.selectedGeography ?? null,
    selectedScenarioId: candidate.selectedScenarioId ?? null,
    customWeights: candidate.customWeights ?? null,
    constraints: {
      budgetProxy: candidate.constraints?.budgetProxy ?? null,
      interventionType: candidate.constraints?.interventionType ?? null,
      notes: candidate.constraints?.notes ?? "",
    },
    selectedEvidenceIds: Array.isArray(candidate.selectedEvidenceIds) ? candidate.selectedEvidenceIds : [],
    evidenceSnapshots: Array.isArray(candidate.evidenceSnapshots) ? candidate.evidenceSnapshots : [],
    uploadedDocuments: Array.isArray(candidate.uploadedDocuments) ? candidate.uploadedDocuments : [],
    documentFindings: Array.isArray(candidate.documentFindings) ? candidate.documentFindings : [],
    includedPassages: Array.isArray(candidate.includedPassages) ? candidate.includedPassages : [],
    userNotes: typeof candidate.userNotes === "string" ? candidate.userNotes : "",
    targetAudience: typeof candidate.targetAudience === "string" ? candidate.targetAudience : "commissioner",
    projectGoal: typeof candidate.projectGoal === "string" ? candidate.projectGoal : "",
    sourcePage: typeof candidate.sourcePage === "string" ? candidate.sourcePage : null,
    meetingDetails: {
      meetingType: candidate.meetingDetails?.meetingType ?? "",
      meetingDate: candidate.meetingDetails?.meetingDate ?? null,
    },
    requestedOutputs: Array.isArray(candidate.requestedOutputs) ? candidate.requestedOutputs : [],
    exportHistory: Array.isArray(candidate.exportHistory) ? candidate.exportHistory : [],
    configurationHash: candidate.configurationHash ?? null,
  };
}
