"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type CorrelationDiagnostic, type CriterionValidityResult } from "@/lib/api";

/**
 * Every correlation this platform computes, in one place: convergent
 * validity against CDC/ATSDR SVI (Phase 4) and criterion validity
 * against modeled ED utilization (Phase 7, RISK-015 closure). Both use
 * the same tautology guard, so every row here is guaranteed independent
 * of the score it is checked against -- never a score validated against
 * its own input.
 */
export function ValidationPanel() {
  const convergentQuery = useQuery({
    queryKey: ["validate-convergent"],
    queryFn: () => api.getCorrelationDiagnostics(),
    retry: 1,
  });
  const criterionQuery = useQuery({
    queryKey: ["validate-criterion"],
    queryFn: () => api.getUtilizationCriterionValidity(),
    retry: 1,
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Tautology guard</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Before computing any correlation below, this platform checks whether the outcome is
          actually a component of the score being validated -- a score can never be validated
          against a variable used to construct it. Every row below passed that check; a row that
          failed it would show &quot;BLOCKED&quot; instead of a correlation, never a fabricated number.
        </p>
      </Card>

      <ValidationSection
        title="Convergent validity -- against CDC/ATSDR Social Vulnerability Index"
        description="Do this platform's priority scores agree, in direction, with an established, independently-built social vulnerability index? A real correlation here is evidence the scoring approach measures something recognizable, not proof it identifies causes or predicts outcomes."
        query={convergentQuery}
        rows={convergentQuery.data?.diagnostics ?? []}
        dataMode={convergentQuery.data?.data_mode}
      />

      <ValidationSection
        title="Criterion validity -- against modeled emergency-department utilization"
        description="Do tracts with a higher priority score also show more modeled emergency-department use? Real ZIP-level HCAI data had to be allocated down to the tract level to make this comparison possible at all -- see the Utilization page for that method and its limitations. A moderate, positive, non-tautological correlation is exactly what would be expected of a defensible screening tool -- not proof of causation."
        query={criterionQuery}
        rows={criterionQuery.data?.results ?? []}
        dataMode={criterionQuery.data?.data_mode}
      />
    </div>
  );
}

function ValidationSection({
  title,
  description,
  query,
  rows,
  dataMode,
}: {
  title: string;
  description: string;
  query: { isLoading: boolean; isError: boolean; error: unknown };
  rows: (CorrelationDiagnostic | CriterionValidityResult)[];
  dataMode?: "live" | "demo";
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>

      {query.isLoading && (
        <LoadingRegion label={`Loading ${title}`}>
          <SkeletonText lines={4} />
        </LoadingRegion>
      )}
      {query.isError && (
        <ErrorState
          title="Validation data unavailable"
          description={query.error instanceof ApiError ? query.error.message : "Couldn't load this validation check."}
        />
      )}

      {rows.length > 0 && (
        <div className="mt-2 space-y-2">
          {rows.map((r) => (
            <Card key={r.scenario_id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{r.scenario_id}</span>
                {r.is_tautological ? (
                  <Badge tone="alert">BLOCKED -- tautological</Badge>
                ) : r.spearman_r !== null ? (
                  <span className="tabular-nums text-sm text-[var(--color-text-primary)]">
                    Spearman r = {r.spearman_r.toFixed(2)} (n = {r.n_paired_observations})
                  </span>
                ) : (
                  <Badge tone="neutral">Not computable</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{r.hypothesis}</p>
              {!r.is_tautological && r.spearman_r !== null && r.bootstrap_ci_lower !== null && r.bootstrap_ci_upper !== null && (
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  95% bootstrap interval: {r.bootstrap_ci_lower.toFixed(2)} to {r.bootstrap_ci_upper.toFixed(2)} ({r.n_bootstrap} draws)
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{r.interpretation_note}</p>
            </Card>
          ))}
        </div>
      )}
      {dataMode && (
        <p className="mt-1 text-xs">
          <DataModeBadge mode={dataMode} />
        </p>
      )}
    </section>
  );
}
