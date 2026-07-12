import { Suspense } from "react";
import { Providers } from "../providers";
import { DataExplorer } from "./data-explorer";

export default function DataPage() {
  return (
    <Providers>
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          Data
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
          Every source this platform loads, its publisher, vintage, license,
          and freshness, plus a preview of every table in the warehouse. This
          is a functional transparency tool for Phase 3, not the final Data
          module design from <code>docs/01_UX_UI_SPEC.md</code>.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--color-text-secondary)]">
                Loading…
              </p>
            }
          >
            <DataExplorer />
          </Suspense>
        </div>
      </main>
    </Providers>
  );
}
