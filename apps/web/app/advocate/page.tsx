import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonText } from "@scc-health/ui";
import { AdvocateClient } from "./advocate-client";

export const metadata: Metadata = { title: "Build a brief" };

export default function AdvocatePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[var(--container-max)] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <SkeletonText lines={6} />
        </div>
      }
    >
      <AdvocateClient />
    </Suspense>
  );
}
