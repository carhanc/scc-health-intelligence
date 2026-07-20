"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "@scc-health/ui";
import { TaskPageHeader } from "../task-page-header";
import { FacilityPanel } from "./facility-panel";
import { GeographicPanel } from "./geographic-panel";
import { TrendsPanel } from "./trends-panel";

type TabId = "facilities" | "geographic" | "trends";

const TASK_CHOICES: { id: TabId; label: string; description: string }[] = [
  {
    id: "facilities",
    label: "Compare facilities",
    description: "See emergency-department characteristics side by side for every county facility.",
  },
  {
    id: "geographic",
    label: "Explore where patients come from",
    description: "See encounters by patient ZIP code, and a modeled allocation down to the tract level.",
  },
  {
    id: "trends",
    label: "See changes over time",
    description: "Countywide emergency-department trends from 2008 to 2024.",
  },
];

const TAB_ITEMS = [
  { id: "facilities", label: "Facility view" },
  { id: "geographic", label: "Geographic view" },
  { id: "trends", label: "Trends over time" },
];

/** "See how health services are used" -- a task-first flow: ask what the
 * user wants to understand before showing any table, rather than
 * defaulting straight into the full facility list (docs/design/product-
 * wide-flow-simplification-research.md "UTILIZATION"). */
export function UtilizationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") as TabId | null;

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/utilization?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <TaskPageHeader
        title="See how health services are used"
        purpose="Explore emergency-department use by facility, community, and year."
      />
      <details className="mt-2 max-w-2xl text-xs text-[var(--color-text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--color-interactive)]">About this data</summary>
        <p className="mt-2">
          Figures here are <strong className="font-semibold text-[var(--color-text-primary)]">observed</strong>{" "}
          counts at their real published geography (county, facility, or patient ZIP code) unless a table
          is explicitly labeled{" "}
          <strong className="font-semibold text-[var(--color-text-primary)]">modeled</strong> -- this
          platform never claims tract-level observed utilization, since HCAI does not publish it.
        </p>
      </details>

      {!activeTab ? (
        <div className="mt-6 max-w-[720px] space-y-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            What would you like to understand?
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TASK_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => updateParams({ tab: choice.id })}
                aria-label={`${choice.label}: ${choice.description}`}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-left transition-colors hover:bg-[var(--color-surface-sunken)]"
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{choice.label}</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{choice.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => updateParams({ tab: null })}
            className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
          >
            ← Back
          </button>
          <div className="mt-3">
            <Tabs
              items={TAB_ITEMS}
              activeId={activeTab}
              onChange={(id) => updateParams({ tab: id })}
              label="Utilization sections"
            />
          </div>

          <div className="mt-4">
            <TabPanel id="facilities" activeId={activeTab}>
              <FacilityPanel />
            </TabPanel>
            <TabPanel id="geographic" activeId={activeTab}>
              <GeographicPanel />
            </TabPanel>
            <TabPanel id="trends" activeId={activeTab}>
              <TrendsPanel />
            </TabPanel>
          </div>
        </div>
      )}
    </div>
  );
}
