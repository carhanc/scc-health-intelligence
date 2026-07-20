"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { LoadingRegion, SkeletonText } from "./Skeleton";

/** A loading state specifically for queries that can plausibly hit a
 * cold-started free-tier backend. Renders an ordinary skeleton at first
 * (the common case: the backend is already warm) and only switches to an
 * explicit "waking up" message after `delayMs` of the same load still
 * being pending -- never claims a guaranteed or precise duration, always
 * offers Retry (docs/design/health-equity-ux-redesign.md §7/§8). */
export function BackendWakeState({
  isLoading,
  onRetry,
  delayMs = 4000,
  skeletonLines = 3,
}: {
  isLoading: boolean;
  onRetry?: () => void;
  delayMs?: number;
  skeletonLines?: number;
}) {
  const [showWakeMessage, setShowWakeMessage] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowWakeMessage(false);
      return;
    }
    const timer = setTimeout(() => setShowWakeMessage(true), delayMs);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  if (!isLoading) return null;

  if (!showWakeMessage) {
    return (
      <LoadingRegion label="Loading">
        <SkeletonText lines={skeletonLines} />
      </LoadingRegion>
    );
  }

  return (
    <div role="status" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8 text-center">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        The data service is waking up
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--color-text-secondary)]">
        The first load may take up to a couple of minutes; later pages should be faster.
      </p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
