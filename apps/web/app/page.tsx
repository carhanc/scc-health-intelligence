import Link from "next/link";
import { Providers } from "./providers";
import { SystemStatus } from "./system-status";

export default function OverviewPage() {
  return (
    <Providers>
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          Santa Clara Health Intelligence
        </h1>
        <p className="mt-3 max-w-xl text-[var(--color-text-secondary)]">
          Find where health needs, access barriers, and service gaps
          overlap. Explore public data, test transparent scenarios, and
          build evidence-backed questions for Santa Clara County advocacy
          and planning.
        </p>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-text-secondary)]">
          This is a Phase 1&ndash;2 developer scaffold, not the final
          Overview page. The full task-first experience (Explore a
          community, Compare priorities, Prepare for a meeting) is built
          starting Phase 5 — see <code>PLAN.md</code> and{" "}
          <code>TASKS.md</code>.
        </p>
        <p className="mt-4">
          <Link
            href="/explore"
            className="text-sm font-medium text-[var(--color-interactive)] underline underline-offset-2"
          >
            Try the Phase 2 geography search →
          </Link>
        </p>
        <div className="mt-8">
          <SystemStatus />
        </div>
      </main>
    </Providers>
  );
}
