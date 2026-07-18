import { Suspense } from "react";
import { SkeletonText } from "@scc-health/ui";
import { DataExplorer } from "./data-explorer";

export default function DataPage() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Data</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Data sources and coverage: every source this platform loads, its publisher, vintage, freshness,
          and license, plus a live preview of every table behind the scenes. This page reads directly from
          our published source catalog and the live database -- nothing here is a mockup.
        </p>
      </div>
      <div className="mt-8">
        <Suspense fallback={<SkeletonText lines={6} />}>
          <DataExplorer />
        </Suspense>
      </div>
    </div>
  );
}
