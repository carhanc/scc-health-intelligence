import { Suspense } from "react";
import { SkeletonText } from "@scc-health/ui";
import { PrioritizeClient } from "./prioritize-client";

export default function PrioritizePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <SkeletonText lines={6} />
        </div>
      }
    >
      <PrioritizeClient />
    </Suspense>
  );
}
