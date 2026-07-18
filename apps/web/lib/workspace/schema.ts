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
  userNotes: string;
  targetAudience: string;
  /** Plain-language answer to "What do you want this document to help
   * accomplish?" -- new field, additive-only (see migrateWorkspace: an
   * older saved project or backup without it defaults to ""). */
  projectGoal: string;
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
    userNotes: "",
    targetAudience: "commissioner",
    projectGoal: "",
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
    userNotes: typeof candidate.userNotes === "string" ? candidate.userNotes : "",
    targetAudience: typeof candidate.targetAudience === "string" ? candidate.targetAudience : "commissioner",
    projectGoal: typeof candidate.projectGoal === "string" ? candidate.projectGoal : "",
    meetingDetails: {
      meetingType: candidate.meetingDetails?.meetingType ?? "",
      meetingDate: candidate.meetingDetails?.meetingDate ?? null,
    },
    requestedOutputs: Array.isArray(candidate.requestedOutputs) ? candidate.requestedOutputs : [],
    exportHistory: Array.isArray(candidate.exportHistory) ? candidate.exportHistory : [],
    configurationHash: candidate.configurationHash ?? null,
  };
}
