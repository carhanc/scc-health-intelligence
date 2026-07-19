"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "@scc-health/ui";
import { TaskPageHeader } from "../task-page-header";
import { CoveragePanel } from "./coverage-panel";
import { MethodsPanel } from "./methods-panel";
import { UncertaintyPanel } from "./uncertainty-panel";
import { ValidationPanel } from "./validation-panel";
import { LimitationsPanel, ReproducibilityPanel } from "./limitations-panel";

type TabId = "overview" | "methods" | "checks" | "limitations" | "reproducibility";

const TAB_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "methods", label: "How scores are built" },
  { id: "checks", label: "Checks and uncertainty" },
  { id: "limitations", label: "Known limitations" },
  { id: "reproducibility", label: "Reproduce the analysis" },
];

/** "Trust, methods, and data quality" -- a trust-first Overview
 * (grouped, plain-language source status) replaces six equally-weighted
 * tabs and six equal-sized metric cards regardless of whether a bucket
 * is ever non-zero. Uncertainty & sensitivity and Validation are merged
 * into one "Checks and uncertainty" section, since a first-time visitor
 * shouldn't have to know which of the two to enter first (docs/design/
 * product-wide-flow-simplification-research.md "VALIDATE"). */
export function ValidateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "overview";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/validate?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <TaskPageHeader
        title="Trust, methods, and data quality"
        purpose="See what data is current, how scores are built, and what the platform cannot tell you."
      />

      <div className="mt-5">
        <Tabs
          items={TAB_ITEMS}
          activeId={activeTab}
          onChange={(id) => updateParams({ tab: id === "overview" ? null : id })}
          label="Validate sections"
        />

        <div className="mt-4">
          <TabPanel id="overview" activeId={activeTab}>
            <CoveragePanel />
          </TabPanel>
          <TabPanel id="methods" activeId={activeTab}>
            <MethodsPanel />
          </TabPanel>
          <TabPanel id="checks" activeId={activeTab}>
            <div className="space-y-8">
              <UncertaintyPanel />
              <div className="border-t border-[var(--color-border)] pt-8">
                <ValidationPanel />
              </div>
            </div>
          </TabPanel>
          <TabPanel id="limitations" activeId={activeTab}>
            <LimitationsPanel />
          </TabPanel>
          <TabPanel id="reproducibility" activeId={activeTab}>
            <ReproducibilityPanel />
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
