import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "interactive" | "caution" | "alert" | "success";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Small leading dot indicator -- decorative, meaning is always in the text label too (never color-only). */
  dot?: boolean;
  className?: string;
  title?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] bg-[var(--color-neutral-subtle)]",
  interactive: "border-[var(--color-interactive)] text-[var(--color-interactive-hover)] bg-[var(--color-interactive-subtle)]",
  caution: "border-[var(--color-caution)] text-[var(--color-caution-strong)] bg-[var(--color-caution-subtle)]",
  alert: "border-[var(--color-alert)] text-[var(--color-alert)] bg-[var(--color-alert-subtle)]",
  success: "border-[var(--color-success)] text-[var(--color-success)] bg-[var(--color-success-subtle)]",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--color-neutral)]",
  interactive: "bg-[var(--color-interactive)]",
  caution: "bg-[var(--color-caution)]",
  alert: "bg-[var(--color-alert)]",
  success: "bg-[var(--color-success)]",
};

/** A single badge primitive underlying every status/source/uncertainty/
 * scenario/freshness/stability indicator in the product -- meaning is
 * always carried by the text, color is a reinforcing signal only
 * (docs/01 §18: "no essential information conveyed only by color"). */
export function Badge({
  tone = "neutral",
  children,
  dot = false,
  className = "",
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && (
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />
      )}
      {children}
    </span>
  );
}

// --- Domain-specific badge helpers -------------------------------------

export type StabilityLabel = "Robust" | "Moderately stable" | "Assumption-sensitive" | "Data-limited";

const STABILITY_TONE: Record<StabilityLabel, BadgeTone> = {
  Robust: "success",
  "Moderately stable": "interactive",
  "Assumption-sensitive": "caution",
  "Data-limited": "neutral",
};

const STABILITY_HELP: Record<StabilityLabel, string> = {
  Robust: "This ranking holds up across nearly every tested weighting and data-uncertainty scenario.",
  "Moderately stable": "This area stays elevated overall, but its exact rank shifts somewhat depending on assumptions.",
  "Assumption-sensitive": "Whether this area ranks highly depends a lot on which priorities are weighted most.",
  "Data-limited": "Missing data or high uncertainty makes this ranking less reliable than others.",
};

export function StabilityBadge({ label }: { label: StabilityLabel }) {
  return (
    <Badge tone={STABILITY_TONE[label]} dot title={STABILITY_HELP[label]}>
      {label}
    </Badge>
  );
}

export type FreshnessState =
  | "unavailable"
  | "draft"
  | "intentional_older"
  | "newest_verified"
  | "lagged"
  | "stale";

const FRESHNESS_LABEL: Record<FreshnessState, string> = {
  unavailable: "Data unavailable",
  draft: "Draft source (not used)",
  intentional_older: "Published on its normal schedule",
  newest_verified: "Recently checked",
  lagged: "Refresh due soon",
  stale: "Overdue for refresh",
};

const FRESHNESS_TONE: Record<FreshnessState, BadgeTone> = {
  unavailable: "alert",
  draft: "alert",
  intentional_older: "neutral",
  newest_verified: "success",
  lagged: "caution",
  stale: "alert",
};

export function FreshnessBadge({ state }: { state: FreshnessState }) {
  return (
    <Badge tone={FRESHNESS_TONE[state]} dot>
      {FRESHNESS_LABEL[state]}
    </Badge>
  );
}

export function DataModeBadge({ mode }: { mode: "live" | "demo" | "unavailable" }) {
  if (mode === "live") {
    return (
      <Badge tone="success" dot>
        Live data
      </Badge>
    );
  }
  if (mode === "demo") {
    return (
      <Badge tone="caution" dot>
        Demo snapshot
      </Badge>
    );
  }
  return (
    <Badge tone="alert" dot>
      Data unavailable
    </Badge>
  );
}
