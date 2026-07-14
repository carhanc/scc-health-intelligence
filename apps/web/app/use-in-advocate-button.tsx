"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@scc-health/ui";
import { createWorkspaceFromGeography, type QuickAdvocateGeography } from "@/lib/workspace/quick-add";

/**
 * Shared "Use in Advocate" action for Explore, Prioritize, Access Lab,
 * and Utilization. Creates a new local workspace pre-filled with this
 * page's real, structured geography (and scenario, where relevant) and
 * navigates straight there -- never scrapes on-screen text.
 */
export function UseInAdvocateButton({
  geography,
  scenarioId,
  label = "Use in Advocate",
}: {
  geography: QuickAdvocateGeography;
  scenarioId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleClick() {
    setIsCreating(true);
    try {
      const workspaceId = await createWorkspaceFromGeography(geography, scenarioId);
      router.push(`/advocate?workspace=${workspaceId}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} disabled={isCreating}>
      {isCreating ? "Preparing…" : label}
    </Button>
  );
}
