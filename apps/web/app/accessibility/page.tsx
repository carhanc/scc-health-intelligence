export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Accessibility</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          This platform is built to be usable with a keyboard alone, with a screen reader, and at every required
          responsive width, checked continuously rather than as an afterthought.
        </p>

        <div className="mt-8 space-y-6 text-sm text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">What&apos;s tested</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                Automated accessibility scans (axe-core) across every page and major workflow state, gating every
                change before it ships.
              </li>
              <li>Full keyboard-only workflows: search, selection, evidence review, and brief generation.</li>
              <li>Screen-reader-relevant structure: heading order, landmark regions, and labeled form controls.</li>
              <li>Responsive layouts at six required widths, from 320px mobile to 1440px desktop, with no horizontal overflow.</li>
              <li>Color is never the only way information is conveyed -- every percentile, badge, and status also has a text label.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Known limitations</h2>
            <p className="mt-1.5">
              The interactive map (Explore) is the one component with an inherent accessibility ceiling common to
              any map visualization -- every place it shows is also reachable through the accompanying searchable
              table and text-based place search, so no information is available only through the map.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Reporting an issue</h2>
            <p className="mt-1.5">
              If you encounter an accessibility barrier anywhere on this platform, please{" "}
              <a
                href="https://github.com/carhanc/scc-health-intelligence/issues"
                className="text-[var(--color-interactive)] underline"
              >
                open an issue on GitHub
              </a>{" "}
              describing what you were trying to do and what happened.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
