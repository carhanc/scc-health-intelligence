// Cross-page "Add to advocacy project" integration. Carries structured
// state (geography type/id/display name, and optionally a scenario)
// directly into a project -- never scraped display text -- so Explore/
// Prioritize/Access Lab/Utilization can each send a user straight into
// Advocate with real context already filled in, without duplicating any
// analytics logic themselves. Value/unit/source/year/caveat/observed-
// modeled-calculated status are deliberately re-fetched fresh once the
// project loads (via the same evidence endpoint Advocate's Evidence step
// already calls) rather than snapshotted at click time -- this keeps the
// carried state minimal and always current, rather than risking a stale
// snapshot if the underlying data changes between the click and the
// visit to Advocate.

import { createEmptyWorkspace, listWorkspaces, saveWorkspace, suggestProjectTitle } from "./storage";

export interface QuickAdvocateGeography {
  geographyType: string;
  geoid: string;
  displayName: string;
}

/** Existing projects that already have real content -- an empty,
 * never-touched project is not worth asking the user about (docs/
 * design/advocate-intuitive-workspace-research.md §"cross-page
 * integration": only prompt when there's a genuine choice to make). */
export async function listNonEmptyProjects() {
  const all = await listWorkspaces();
  return all.filter((w) => w.selectedGeography !== null || w.selectedEvidenceIds.length > 0);
}

export async function createWorkspaceFromGeography(
  geography: QuickAdvocateGeography,
  scenarioId?: string,
): Promise<string> {
  const workspace = createEmptyWorkspace(suggestProjectTitle({ placeLabel: geography.displayName, outputTypeLabel: null }));
  workspace.selectedGeography = {
    geographyType: geography.geographyType,
    geoid: geography.geoid,
    displayName: geography.displayName,
  };
  if (scenarioId) workspace.selectedScenarioId = scenarioId;
  await saveWorkspace(workspace);
  return workspace.workspaceId;
}

/** Adds this geography to an *existing* project the user explicitly
 * chose (see AddToAdvocacyDialog) -- replaces that project's place/
 * scenario and clears its prior evidence selection, since evidence is
 * fetched per-geography and a stale selection from a different place
 * would silently carry over otherwise. */
export async function addGeographyToExistingWorkspace(
  workspaceId: string,
  geography: QuickAdvocateGeography,
  scenarioId?: string,
): Promise<void> {
  const all = await listWorkspaces();
  const workspace = all.find((w) => w.workspaceId === workspaceId);
  if (!workspace) return;
  workspace.selectedGeography = {
    geographyType: geography.geographyType,
    geoid: geography.geoid,
    displayName: geography.displayName,
  };
  if (scenarioId) workspace.selectedScenarioId = scenarioId;
  workspace.selectedEvidenceIds = [];
  workspace.evidenceSnapshots = [];
  if (!workspace.titleIsUserSet) {
    workspace.title = suggestProjectTitle({ placeLabel: geography.displayName, outputTypeLabel: null });
  }
  await saveWorkspace(workspace);
}
