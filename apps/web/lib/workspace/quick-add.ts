// Cross-page "Use in Advocate" integration (Phase 8, section F). Carries
// structured state (geography type/id/display name, and optionally a
// scenario) directly into a new local workspace -- never scraped
// display text -- so Explore/Prioritize/Access Lab/Utilization can each
// send a user straight into Advocate with real context already filled
// in, without duplicating any analytics logic themselves.

import { createEmptyWorkspace, saveWorkspace } from "./storage";

export interface QuickAdvocateGeography {
  geographyType: string;
  geoid: string;
  displayName: string;
}

export async function createWorkspaceFromGeography(
  geography: QuickAdvocateGeography,
  scenarioId?: string,
): Promise<string> {
  const workspace = createEmptyWorkspace(`${geography.displayName} advocacy`);
  workspace.selectedGeography = {
    geographyType: geography.geographyType,
    geoid: geography.geoid,
    displayName: geography.displayName,
  };
  if (scenarioId) workspace.selectedScenarioId = scenarioId;
  await saveWorkspace(workspace);
  return workspace.workspaceId;
}
