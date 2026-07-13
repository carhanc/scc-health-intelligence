"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabPanel } from "@scc-health/ui";
import { FacilityPanel } from "./facility-panel";
import { GeographicPanel } from "./geographic-panel";
import { TrendsPanel } from "./trends-panel";

type TabId = "facilities" | "geographic" | "trends";

const TAB_ITEMS = [
  { id: "facilities", label: "Facility view" },
  { id: "geographic", label: "Geographic view" },
  { id: "trends", label: "Trends over time" },
];

export function UtilizationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabId | null) ?? "facilities";

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
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Utilization</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          How Santa Clara County residents actually use emergency-department care -- by facility, by
          place, and over time. Figures here are{" "}
          <strong className="font-semibold text-[var(--color-text-primary)]">observed</strong> counts at
          their real published geography (county, facility, or patient ZIP code) unless a table is
          explicitly labeled <strong className="font-semibold text-[var(--color-text-primary)]">modeled</strong> --
          this platform never claims tract-level observed utilization, since HCAI does not publish it.
        </p>
      </div>

      <div className="mt-5">
        <Tabs
          items={TAB_ITEMS}
          activeId={activeTab}
          onChange={(id) => updateParams({ tab: id === "facilities" ? null : id })}
          label="Utilization sections"
        />

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
    </div>
  );
}
