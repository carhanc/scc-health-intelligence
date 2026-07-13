"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, DataModeBadge, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError } from "@/lib/api";
import { domainLabel } from "@/lib/labels";
import { useTractNames } from "@/lib/use-tract-names";

export function ExportPanel({
  scenarioSelection,
}: {
  scenarioSelection: { kind: "named"; scenarioId: string } | { kind: "custom"; weights: Record<string, number> };
}) {
  const [topN, setTopN] = useState(10);
  const tractNames = useTractNames();

  const memoParams = scenarioSelection.kind === "named" ? { scenarioId: scenarioSelection.scenarioId } : { weights: scenarioSelection.weights };
  const csvUrl = api.getPrioritizeExportCsvUrl(memoParams, 408);

  const memoQuery = useQuery({
    queryKey: ["prioritize-memo", scenarioSelection, topN],
    queryFn: () => api.getDecisionMemo(memoParams, topN),
    retry: 1,
  });

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Download the ranked list</h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          A CSV of all 408 tracts under the current scenario or weighting, with each tract's combined
          score, data coverage, and domain scores.
        </p>
        <a
          href={csvUrl}
          className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
        >
          Download CSV
        </a>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Decision memo</h3>
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            Show top
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-0.5"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            tracts
          </label>
        </div>

        {memoQuery.isLoading && (
          <LoadingRegion label="Loading decision memo">
            <SkeletonText lines={6} />
          </LoadingRegion>
        )}
        {memoQuery.isError && (
          <ErrorState
            title="Memo unavailable"
            description={memoQuery.error instanceof ApiError ? memoQuery.error.message : "Couldn't load the decision memo."}
          />
        )}
        {memoQuery.data && <MemoContent memo={memoQuery.data} tractNames={tractNames} />}
      </Card>
    </div>
  );
}

function MemoContent({
  memo,
  tractNames,
}: {
  memo: Awaited<ReturnType<typeof api.getDecisionMemo>>;
  tractNames: Map<string, string>;
}) {
  return (
    <div id="prioritize-memo-print-area" className="mt-3 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold text-[var(--color-text-primary)]">
            Priority recommendation memo -- {memo.scenario_label}
          </h4>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Generated {new Date(memo.generated_at).toLocaleString()} <DataModeBadge mode={memo.data_mode} />
          </p>
        </div>
        <Button onClick={() => window.print()} variant="secondary">
          Print / save as PDF
        </Button>
      </div>

      <p className="text-[var(--color-text-secondary)]">{memo.constraints_note}</p>

      <div>
        <h5 className="font-semibold text-[var(--color-text-primary)]">Top-ranked places</h5>
        <ol className="mt-1.5 space-y-2">
          {memo.top_tracts.map((t) => (
            <li key={t.tract_geoid_2020} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {t.rank}. {tractNames.get(t.tract_geoid_2020) ?? t.tract_geoid_2020}
                </span>
                <span className="tabular-nums text-[var(--color-text-secondary)]">
                  {t.score !== null ? t.score.toFixed(1) : "No score"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Strongest drivers: {t.top_domains.map((d) => domainLabel(d.domain)).join(", ")}
                {" -- "}data coverage {Math.round(t.coverage_fraction * 100)}%.
              </p>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h5 className="font-semibold text-[var(--color-text-primary)]">Methodology</h5>
        <p className="text-[var(--color-text-secondary)]">{memo.methodology_note}</p>
      </div>
      <div>
        <h5 className="font-semibold text-[var(--color-text-primary)]">Limitations</h5>
        <p className="text-[var(--color-text-secondary)]">{memo.limitations_note}</p>
      </div>
      <div>
        <h5 className="font-semibold text-[var(--color-text-primary)]">Sources</h5>
        <p className="text-[var(--color-text-secondary)]">{memo.sources_note}</p>
      </div>
    </div>
  );
}
