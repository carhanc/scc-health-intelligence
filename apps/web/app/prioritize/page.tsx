import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonText } from "@scc-health/ui";
import { PrioritizeClient } from "./prioritize-client";

export const metadata: Metadata = { title: "Advanced ranking tools" };

export default function PrioritizePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[var(--container-max)] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <SkeletonText lines={6} />
        </div>
      }
    >
      <PrioritizeClient />
    </Suspense>
  );
}
