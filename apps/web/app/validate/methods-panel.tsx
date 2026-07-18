"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api } from "@/lib/api";
import { domainLabel } from "@/lib/labels";

/**
 * Plain language first: a short, fixed explanation of the four-step
 * aggregation method, with the real metric registry and scenario
 * weights (already-tested Phase 4 config, not re-derived) available to
 * expand into below.
 */
export function MethodsPanel() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          How the health equity screening score is built
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          The 0-100 number shown throughout this platform (Explore, Prioritize, Compare, Advocate) is a screening
          and prioritization signal, not a direct measurement of health equity: 0 means lower overlapping
          screening concern, 100 means higher, and a low score does not certify a place as healthy or equitable.
        </p>
        <ol className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">
          <li>
            <strong className="font-medium text-[var(--color-text-primary)]">1. Metric.</strong> Each published
            measure (e.g. the share of adults with diabetes) is converted to a percentile against every other
            Santa Clara County tract -- so a raw value is always shown alongside where it stands countywide.
          </li>
          <li>
            <strong className="font-medium text-[var(--color-text-primary)]">2. Subdomain, then domain.</strong>{" "}
            Related metrics average into a subdomain, then subdomains average into one of five domains (health
            needs, access barriers, environmental conditions, community resources, workforce shortage). A tract
            missing too many subdomains gets no domain score at all -- never a zero standing in for missing data.
          </li>
          <li>
            <strong className="font-medium text-[var(--color-text-primary)]">3. Scenario weighting.</strong> A
            named screening view (or a custom weighting on the Prioritize page) combines the five domain scores
            into one 0-100 health equity screening score, using a weighted average. A domain missing for a tract
            has its weight excluded and the rest renormalized, not treated as zero -- see
            &quot;coverage_fraction&quot; on any score.
          </li>
          <li>
            <strong className="font-medium text-[var(--color-text-primary)]">4. Uncertainty and sensitivity.</strong>{" "}
            Every score also carries a Monte Carlo uncertainty range and a stability label showing how much the
            ranking would change under a different reasonable weighting -- see the Uncertainty &amp; sensitivity tab.
          </li>
        </ol>
      </Card>

      <DomainRegistry />
      <ScenarioWeights />
    </div>
  );
}

function DomainRegistry() {
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["validate-domains"], queryFn: () => api.getDomains(), retry: 1 });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading metric registry">
        <SkeletonText lines={4} />
      </LoadingRegion>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState title="Metric registry unavailable" description="Couldn't load domain/metric detail." />;
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Metric registry, by domain</h2>
      <div className="mt-2 space-y-2">
        {query.data.domains.map((d) => (
          <div key={d.domain}>
            <button
              type="button"
              onClick={() => setExpandedDomain(expandedDomain === d.domain ? null : d.domain)}
              aria-expanded={expandedDomain === d.domain}
              className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              {domainLabel(d.domain)} ({d.metrics.length} metrics)
              <span aria-hidden="true">{expandedDomain === d.domain ? "−" : "+"}</span>
            </button>
            {expandedDomain === d.domain && (
              <ul className="mt-1.5 space-y-2 pl-3">
                {d.metrics.map((m) => (
                  <li key={m.metric_id} className="border-l-2 border-[var(--color-border)] pl-3 text-xs">
                    <p className="font-medium text-[var(--color-text-primary)]">{m.label}</p>
                    <p className="text-[var(--color-text-secondary)]">{m.plain_language_definition}</p>
                    <p className="mt-0.5 text-[var(--color-text-tertiary)]">Source: {m.citation}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScenarioWeights() {
  const query = useQuery({ queryKey: ["validate-scenarios"], queryFn: () => api.getScenarios(), retry: 1 });

  if (query.isLoading || !query.data) return null;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Scenario weights</h2>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        The exact weight each named scenario gives each domain -- also available as a downloadable, hashed record
        on the Reproducibility tab.
      </p>
      <div
        className="mt-2 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Domain weight by scenario, scrollable table"
      >
        <table className="w-full min-w-max border-collapse text-left text-xs">
          <caption className="sr-only">Domain weight by scenario</caption>
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th scope="col" className="px-2 py-1.5 font-semibold">Scenario</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">Health burden</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">Access barriers</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">Environmental burden</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">Resource accessibility</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">Workforce shortage</th>
            </tr>
          </thead>
          <tbody>
            {query.data.scenarios.map((s) => (
              <tr key={s.scenario_id} className="border-b border-[var(--color-border)]">
                <td className="px-2 py-1.5 font-medium text-[var(--color-text-primary)]">{s.label}</td>
                {["health_burden", "access_barriers", "environmental_burden", "resource_accessibility", "workforce_shortage"].map(
                  (domain) => (
                    <td key={domain} className="px-2 py-1.5 tabular-nums">
                      {s.weights[domain] !== undefined ? `${Math.round(s.weights[domain] * 100)}%` : "--"}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
