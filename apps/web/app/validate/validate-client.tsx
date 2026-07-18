"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "@scc-health/ui";
import { CoveragePanel } from "./coverage-panel";
import { MethodsPanel } from "./methods-panel";
import { UncertaintyPanel } from "./uncertainty-panel";
import { ValidationPanel } from "./validation-panel";
import { LimitationsPanel, ReproducibilityPanel } from "./limitations-panel";

type TabId = "coverage" | "methods" | "uncertainty" | "validation" | "limitations" | "reproducibility";

const TAB_ITEMS = [
  { id: "coverage", label: "Data coverage" },
  { id: "methods", label: "Scoring methods" },
  { id: "uncertainty", label: "Uncertainty & sensitivity" },
  { id: "validation", label: "Validation" },
  { id: "limitations", label: "Known limitations" },
  { id: "reproducibility", label: "Reproducibility" },
];

export function ValidateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "coverage";

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
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Validate</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Trust, methods, and data quality -- can you trust what you&apos;re seeing, and what are its
          limits? What data goes in, how a score is built, how uncertain it is, whether it holds up
          against independent checks, and what it still cannot tell you. Plain-language summaries come
          first; the exact numbers behind them are always one click away.
        </p>
      </div>

      <div className="mt-5">
        <Tabs
          items={TAB_ITEMS}
          activeId={activeTab}
          onChange={(id) => updateParams({ tab: id === "coverage" ? null : id })}
          label="Validate sections"
        />

        <div className="mt-4">
          <TabPanel id="coverage" activeId={activeTab}>
            <CoveragePanel />
          </TabPanel>
          <TabPanel id="methods" activeId={activeTab}>
            <MethodsPanel />
          </TabPanel>
          <TabPanel id="uncertainty" activeId={activeTab}>
            <UncertaintyPanel />
          </TabPanel>
          <TabPanel id="validation" activeId={activeTab}>
            <ValidationPanel />
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
