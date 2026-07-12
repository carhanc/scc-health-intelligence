import Link from "next/link";
import { CountywideSnapshot, FreshnessSummary, PrioritySnapshot } from "./overview-snapshot";

const TASK_CARDS = [
  {
    title: "Explore a community",
    description:
      "Search Sunnyvale, San Jose, a supervisor district, or a census tract, and see its health, access, and resource picture.",
    href: "/explore",
    cta: "Start exploring",
  },
  {
    title: "See where concerns overlap",
    description:
      "View every tract ranked by combined health, access, and resource concern, and understand what drives each ranking.",
    href: "/explore?tab=table",
    cta: "See the county ranking",
  },
  {
    title: "Compare two places",
    description:
      "Put two tracts, cities, or districts side by side and see exactly where and why they differ.",
    href: "/explore?compare=1",
    cta: "Compare places",
  },
];

const TRUST_POINTS = [
  {
    title: "Public data only",
    body: "Every number comes from federal, state, county, or transit-agency sources -- never uploaded or invented data.",
  },
  {
    title: "No individual-level data",
    body: "Every figure describes a neighborhood or aggregate group. Nothing here identifies or predicts an individual person.",
  },
  {
    title: "Methods are always visible",
    body: "Every score can be broken down into the exact metrics, weights, and sources that produced it.",
  },
  {
    title: "Uncertainty is shown, not hidden",
    body: "Margins of error, data gaps, and how sensitive a ranking is to assumptions are shown next to every score.",
  },
  {
    title: "Screening, not causation",
    body: "A high score means an area warrants a closer look -- it is not a claim that any specific program will fix it.",
  },
];

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      {/* A. Product introduction */}
      <section aria-labelledby="hero-heading" className="max-w-3xl">
        <h1 id="hero-heading" className="text-3xl font-semibold leading-tight text-[var(--color-text-primary)] sm:text-4xl">
          Find where health needs and access barriers overlap in Santa Clara County
        </h1>
        <p className="mt-3 text-base text-[var(--color-text-secondary)] sm:text-lg">
          Explore public health, social, and resource data by neighborhood, understand what
          drives each area&rsquo;s picture, and build evidence-backed questions for advocacy
          and planning -- with sources and uncertainty shown at every step.
        </p>
      </section>

      {/* B. Primary task entry points */}
      <section aria-labelledby="tasks-heading" className="mt-8">
        <h2 id="tasks-heading" className="sr-only">
          What would you like to do?
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TASK_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-interactive)]"
            >
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {card.title}
              </h3>
              <p className="mt-1.5 flex-1 text-sm text-[var(--color-text-secondary)]">
                {card.description}
              </p>
              <span className="mt-3 text-sm font-medium text-[var(--color-interactive)] group-hover:underline">
                {card.cta} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* C. Countywide snapshot */}
      <section aria-labelledby="snapshot-heading" className="mt-12">
        <h2 id="snapshot-heading" className="text-xl font-semibold text-[var(--color-text-primary)]">
          Countywide snapshot
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          A small set of decision-relevant summaries, not a wall of metrics.
        </p>
        <div className="mt-4">
          <CountywideSnapshot />
        </div>
      </section>

      {/* D. Priority snapshot */}
      <section aria-labelledby="priority-heading" className="mt-12">
        <h2 id="priority-heading" className="text-xl font-semibold text-[var(--color-text-primary)]">
          Where might action be most urgent?
        </h2>
        <div className="mt-4">
          <PrioritySnapshot />
        </div>
      </section>

      {/* E. Data freshness/status */}
      <section aria-labelledby="freshness-heading" className="mt-12 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
        <h2 id="freshness-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
          Data status
        </h2>
        <div className="mt-2">
          <FreshnessSummary />
        </div>
      </section>

      {/* F. Trust section */}
      <section aria-labelledby="trust-heading" className="mt-12">
        <h2 id="trust-heading" className="text-xl font-semibold text-[var(--color-text-primary)]">
          How to read what this platform shows you
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          {TRUST_POINTS.map((point) => (
            <div key={point.title}>
              <dt className="text-sm font-semibold text-[var(--color-text-primary)]">{point.title}</dt>
              <dd className="mt-1 text-sm text-[var(--color-text-secondary)]">{point.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* G. Footer */}
      <footer className="mt-16 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-text-secondary)]">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/data" className="hover:text-[var(--color-interactive)] hover:underline">
            Data &amp; methods
          </Link>
          <Link href="/validate" className="hover:text-[var(--color-interactive)] hover:underline">
            Accessibility
          </Link>
          <Link href="/validate" className="hover:text-[var(--color-interactive)] hover:underline">
            Privacy
          </Link>
          <a
            href="https://github.com/anthropics/claude-code/issues"
            className="hover:text-[var(--color-interactive)] hover:underline"
          >
            Contact / report an issue
          </a>
        </nav>
        <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">
          Santa Clara Health Intelligence is a clean-room, open-data public-health intelligence
          platform. It supports prioritization and advocacy; it does not replace community
          engagement, official county systems, clinical judgment, or formal program evaluation.
        </p>
      </footer>
    </div>
  );
}
