import { Suspense } from "react";
import { SkeletonText } from "@scc-health/ui";
import { DataExplorer } from "./data-explorer";

export default function DataPage() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">
          Explore data sources and coverage
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Find a source and see its publisher, vintage, freshness, and license -- and where it's used.
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
