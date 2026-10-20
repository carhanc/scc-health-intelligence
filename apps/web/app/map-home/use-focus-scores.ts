"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type CustomDomainContribution, type StabilityLabel } from "@/lib/api";
import { CUSTOM_SCENARIO_ID } from "../prioritize/scenario-selector";

export interface FocusRow {
  geoid: string;
  score: number | null;
  coverage: number;
  stability: StabilityLabel | null;
  /** 1 = highest concern. Position in the API's own score-descending order. */
  rank: number;
}

/**
 * Scores for all 408 tracts under the active focus area: a named scenario
 * (precomputed, with stability labels) or live custom weights (computed by
 * the API on demand, no stability labels). One small request that feeds the
 * map colors, the ranked list and the county strip, so they can never
 * disagree with each other.
 */
export function useFocusScores(scenarioId: string, customWeights: Record<string, number>) {
  const isCustom = scenarioId === CUSTOM_SCENARIO_ID;

  const named = useQuery({
    queryKey: ["focus-scores", scenarioId],
    queryFn: () => api.getScenarioScores(scenarioId, { limit: 408, order: "score_desc" }),
    enabled: !isCustom,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const custom = useQuery({
    queryKey: ["focus-custom-scores", customWeights],
    queryFn: () => api.computeCustomScore(customWeights),
    enabled: isCustom,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const active = isCustom ? custom : named;

  const rows: FocusRow[] = useMemo(() => {
    if (!isCustom && named.data) {
      return named.data.scores.map((s, i) => ({
        geoid: s.tract_geoid_2020,
        score: s.score,
        coverage: s.coverage_fraction,
        stability: s.stability_label,
        rank: i + 1,
      }));
    }
    if (isCustom && custom.data) {
      return custom.data.tracts.map((t, i) => ({
        geoid: t.tract_geoid_2020,
        score: t.score,
        coverage: t.coverage_fraction,
        stability: null,
        rank: i + 1,
      }));
    }
    return [];
  }, [isCustom, named.data, custom.data]);

  const scoreMap = useMemo(() => {
    if (rows.length === 0) return null;
    return new Map<string, number | null>(rows.map((r) => [r.geoid, r.score]));
  }, [rows]);

  /** Per-domain contributions, available only for custom weights (the
   * metric-level breakdown exists only for the named focus areas). */
  const contributions = useMemo(() => {
    if (!isCustom || !custom.data) return null;
    return new Map<string, CustomDomainContribution[]>(
      custom.data.tracts.map((t) => [t.tract_geoid_2020, t.domain_contributions]),
    );
  }, [isCustom, custom.data]);

  return {
    rows,
    scoreMap,
    contributions,
    isLoading: active.isLoading,
    isError: active.isError,
    isStale: active.isPlaceholderData,
    isCustom,
  };
}
