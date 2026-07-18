"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@scc-health/ui";
import type { AdvocacyWorkspace } from "@/lib/workspace/storage";
import {
  addGeographyToExistingWorkspace,
  createWorkspaceFromGeography,
  listNonEmptyProjects,
  type QuickAdvocateGeography,
} from "@/lib/workspace/quick-add";
import { ADD_TO_ADVOCACY_PROJECT_CTA } from "@/lib/advocacy-terms";
import { AddToAdvocacyDialog } from "./add-to-advocacy-dialog";

/**
 * Shared "Add to advocacy project" action for Explore, Prioritize,
 * Access Lab, and Utilization. Creates or updates a local project
 * pre-filled with this page's real, structured geography (and scenario,
 * where relevant) and navigates straight there -- never scrapes on-
 * screen text. If more than one real project already exists, asks which
 * one should receive this evidence rather than silently creating a new,
 * disconnected project every time (docs/design/advocate-intuitive-
 * workspace-research.md §"cross-page integration").
 */
export function UseInAdvocateButton({
  geography,
  scenarioId,
  label = ADD_TO_ADVOCACY_PROJECT_CTA,
}: {
  geography: QuickAdvocateGeography;
  scenarioId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [existingProjects, setExistingProjects] = useState<AdvocacyWorkspace[] | null>(null);

  async function navigateTo(workspaceId: string) {
    router.push(`/advocate?workspace=${workspaceId}&added=1`);
  }

  async function handleClick() {
    setIsCreating(true);
    try {
      const nonEmpty = await listNonEmptyProjects();
      if (nonEmpty.length === 0) {
        const workspaceId = await createWorkspaceFromGeography(geography, scenarioId);
        await navigateTo(workspaceId);
        return;
      }
      // More than one real project already exists (or one exists and
      // already has content) -- ask which project this evidence belongs
      // to instead of guessing.
      setExistingProjects(nonEmpty);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDialogConfirm(targetWorkspaceId: string | null) {
    setIsCreating(true);
    try {
      if (targetWorkspaceId) {
        await addGeographyToExistingWorkspace(targetWorkspaceId, geography, scenarioId);
        await navigateTo(targetWorkspaceId);
      } else {
        const workspaceId = await createWorkspaceFromGeography(geography, scenarioId);
        await navigateTo(workspaceId);
      }
    } finally {
      setIsCreating(false);
      setExistingProjects(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={handleClick} disabled={isCreating}>
        {isCreating ? "Adding…" : label}
      </Button>
      {existingProjects && (
        <AddToAdvocacyDialog
          open
          onClose={() => setExistingProjects(null)}
          existingProjects={existingProjects}
          newPlaceLabel={geography.displayName}
          onConfirm={handleDialogConfirm}
        />
      )}
    </>
  );
}
