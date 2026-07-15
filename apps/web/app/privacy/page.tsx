export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">Privacy</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          What this platform does and does not do with your data. This describes the actual implementation --
          nothing here is a legal promise beyond what the code does.
        </p>

        <div className="mt-8 space-y-6 text-sm text-[var(--color-text-secondary)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              No accounts, no tracking of who you are
            </h2>
            <p className="mt-1.5">
              This platform has no account system. There is nothing to sign up for, and no personal information is
              collected about who is using it. Every visit is anonymous.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Anonymous, aggregate site analytics
            </h2>
            <p className="mt-1.5">
              The production deployment uses Vercel Web Analytics and Speed Insights to see, in aggregate, which
              pages are visited and how quickly the site loads for real users. This is limited to anonymous page-view
              counts and performance timing -- there are no custom events, no cookies, and no per-person profile.
              It never records what you search for, what you upload, what you type into Advocate or Copilot, or any
              other content you enter. These tools run only on the production deployment; local development and any
              non-Vercel host see no network calls from them at all.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Advocate workspaces are stored only in your browser
            </h2>
            <p className="mt-1.5">
              Anything you build in Advocate -- a selected place, chosen evidence, notes, or a generated brief --
              is saved to your browser&apos;s local storage (IndexedDB) on your own device. It is never sent to or
              stored on our server. Clearing your browser&apos;s site data for this platform will delete it; use
              the &quot;Export JSON&quot; button first if you want to keep a copy. Workspaces do not sync between
              devices or browsers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Uploaded documents</h2>
            <p className="mt-1.5">
              A document you upload for analysis (an agenda, staff report, or similar) is processed in memory, on
              our server, for that single request only. It is never written to disk and never stored after the
              response is returned. Only the extracted findings (detected topics, places mentioned, and similar) --
              never the original file -- are saved to your local workspace. Do not upload anything containing
              protected health information (PHI); this platform has no PHI storage or handling capability. See{" "}
              <a
                href="https://github.com/carhanc/scc-health-intelligence/blob/main/docs/security/document-handling.md"
                className="text-[var(--color-interactive)] underline"
              >
                the technical documentation
              </a>{" "}
              for the full detail.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Optional AI-assisted Copilot mode
            </h2>
            <p className="mt-1.5">
              Copilot works fully without any AI provider by default (deterministic mode). If this deployment&apos;s
              operator has configured an AI provider and you specifically choose to use AI-assisted mode for a given
              question, the evidence and text relevant to that one request are sent to that provider (currently
              Anthropic). This never happens automatically, and never for document analysis or the rest of the
              Advocate workflow.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">What we log</h2>
            <p className="mt-1.5">
              Server request logs record the request path, method, response status, and timing -- never the
              content of a request, an uploaded document, or your workspace data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Public health data only
            </h2>
            <p className="mt-1.5">
              Every metric and score this platform shows comes from public federal, state, county, or
              transit-agency sources -- see the{" "}
              <a href="/data" className="text-[var(--color-interactive)] underline">
                Data page
              </a>{" "}
              for the full source list. Nothing here identifies or is derived from any individual person.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
