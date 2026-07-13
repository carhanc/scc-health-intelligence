"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";

export function LimitationsPanel() {
  const query = useQuery({ queryKey: ["validate-limitations"], queryFn: () => api.getKnownLimitations(), retry: 1 });

  if (query.isLoading) {
    return (
      <LoadingRegion label="Loading known limitations">
        <SkeletonText lines={6} />
      </LoadingRegion>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState title="Limitations unavailable" description="Couldn't load the known-limitations list." />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Every limitation this platform is aware of, stated plainly -- including gaps that are still open, not just
        ones already worked around.
      </p>
      {query.data.limitations.map((l) => (
        <Card key={l.category}>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{l.category}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{l.statement}</p>
        </Card>
      ))}
    </div>
  );
}

export function ReproducibilityPanel() {
  const reproQuery = useQuery({ queryKey: ["validate-reproducibility"], queryFn: () => api.getReproducibility(), retry: 1 });
  const auditQuery = useQuery({ queryKey: ["validate-audit-status"], queryFn: () => api.getAuditStatus(), retry: 1 });

  return (
    <div className="space-y-5">
      {auditQuery.isLoading && (
        <LoadingRegion label="Loading audit status">
          <SkeletonText lines={4} />
        </LoadingRegion>
      )}
      {auditQuery.isError && (
        <ErrorState
          title="Audit status unavailable"
          description={auditQuery.error instanceof ApiError ? auditQuery.error.message : "No audit run has been persisted yet."}
        />
      )}
      {auditQuery.data && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Audit status</h2>
            <Badge tone={auditQuery.data.all_passed ? "success" : "alert"}>
              {auditQuery.data.all_passed ? "All checks passing" : "Some checks failing"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Last run: {auditQuery.data.run_at ? new Date(auditQuery.data.run_at).toLocaleString() : "unknown"}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {auditQuery.data.suites.map((s) => (
              <li key={s.suite} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-xs">
                <div className="font-medium text-[var(--color-text-primary)]">{s.suite.replace(/_/g, " ")}</div>
                <div className="tabular-nums text-[var(--color-text-secondary)]">
                  {s.n_passed}/{s.n_checks} passing
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {reproQuery.data && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Reproducibility</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{reproQuery.data.note}</p>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[var(--color-text-secondary)]">Monte Carlo</dt>
              <dd className="text-[var(--color-text-primary)]">
                seed {reproQuery.data.monte_carlo_seed}, {reproQuery.data.monte_carlo_draws} draws
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-text-secondary)]">Weight sensitivity</dt>
              <dd className="text-[var(--color-text-primary)]">
                seed {reproQuery.data.weight_sensitivity_seed}, {reproQuery.data.weight_sensitivity_draws} draws
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-text-secondary)]">Sources tracked</dt>
              <dd className="text-[var(--color-text-primary)]">{reproQuery.data.data_manifest_source_count}</dd>
            </div>
          </dl>

          <h3 className="mt-4 text-xs font-semibold text-[var(--color-text-primary)]">Scenario configuration hashes</h3>
          <ul className="mt-1.5 space-y-1 text-xs">
            {reproQuery.data.scenario_hashes.map((h) => (
              <li key={h.scenario_id} className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">{h.label}</span>
                <code className="text-[var(--color-text-tertiary)]">{h.weights_hash}</code>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 text-xs font-semibold text-[var(--color-text-primary)]">Recent pipeline builds</h3>
          <ul className="mt-1.5 space-y-1 text-xs">
            {reproQuery.data.recent_builds.slice(0, 8).map((b) => (
              <li key={b.build_id} className="text-[var(--color-text-secondary)]">
                {new Date(b.finished_at).toLocaleString()} -- {b.phase.replace(/_/g, " ")}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs">
            <DataModeBadge mode={reproQuery.data.data_mode} />
          </p>
        </Card>
      )}
    </div>
  );
}
