import type { ReactNode } from "react";
import { Button } from "./Button";

interface StateMessageProps {
  title: string;
  description: ReactNode;
  action?: { label: string; onClick: () => void };
  /** A link (`href`) or a non-navigating action (`onClick`) -- e.g. "Clear
   * selection", which resets local/URL state rather than going anywhere. */
  secondaryAction?: { label: string } & ({ href: string } | { onClick: () => void });
  icon?: ReactNode;
}

function StateMessageBase({
  title,
  description,
  action,
  secondaryAction,
  icon,
  role,
  tone,
}: StateMessageProps & { role: "status" | "alert"; tone: "neutral" | "alert" }) {
  const borderColor =
    tone === "alert" ? "border-[var(--color-alert)]/40" : "border-[var(--color-border)]";
  return (
    <div
      role={role}
      className={`rounded-[var(--radius-lg)] border ${borderColor} bg-[var(--color-surface)] px-6 py-8 text-center`}
    >
      {icon && (
        <div aria-hidden="true" className="mx-auto mb-3 flex h-10 w-10 items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
      {/* A <div>, not a <p> -- `description` is typed as ReactNode and
          callers legitimately nest block-level content in it (e.g. a
          <details> disclosure for technical error detail), which is
          invalid inside a <p> and triggers a real hydration error. */}
      <div className="mx-auto mt-1.5 max-w-md text-sm text-[var(--color-text-secondary)]">
        {description}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-4 flex justify-center gap-3">
          {action && (
            <Button variant="primary" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && "href" in secondaryAction && (
            <a
              href={secondaryAction.href}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              {secondaryAction.label}
            </a>
          )}
          {secondaryAction && "onClick" in secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Explains why no result appears and what the user can change (docs/01
 * §17: "Explain why no result appears and what filter can change it"). */
export function EmptyState(props: StateMessageProps) {
  return <StateMessageBase {...props} role="status" tone="neutral" />;
}

/** A recoverable error -- always paired with a retry action or a link to
 * the Data status page (docs/01 §17 "Source failure" requirements). */
export function ErrorState(props: StateMessageProps) {
  return <StateMessageBase {...props} role="alert" tone="alert" />;
}
