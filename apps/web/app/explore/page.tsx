import { Suspense } from "react";
import { Providers } from "../providers";
import { GeographySearch } from "./geography-search";

export default function ExplorePage() {
  return (
    <Providers>
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          Explore
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
          This is a Phase 2 functional scaffold: geography search and
          identity profiles wired to the real API. The full map, layers,
          driver decomposition, and comparison experience from{" "}
          <code>docs/01_UX_UI_SPEC.md</code> §5 is built in Phase 5.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--color-text-secondary)]">
                Loading…
              </p>
            }
          >
            <GeographySearch />
          </Suspense>
        </div>
      </main>
    </Providers>
  );
}
