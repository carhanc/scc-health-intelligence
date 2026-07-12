import type { ReactNode } from "react";

/** A loading placeholder that preserves layout (docs/01 §17: "Use
 * skeletons that preserve layout"). Purely decorative -- wrap the region
 * being loaded in an element with role="status"/aria-live so screen
 * readers announce the loading state once, not per-skeleton-bar. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-neutral-subtle)] ${className}`}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}
