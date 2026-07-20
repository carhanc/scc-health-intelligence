/** A compact horizontal progress indicator for a linear guided flow (e.g.
 * "Place -> Evidence -> Create -> Review") -- lightweight, sits above the
 * work area, and is never combined with project-management controls
 * (docs/design/advocate-flow-simplification-visual-review.md). Each step
 * is a real, keyboard-reachable button with a screen-reader-friendly
 * current/complete/not-started name; state is communicated through text
 * and shape, never color alone. Replaces the old vertical, permanently-
 * railed `StepIndicator` for flows that should read as a short, linear
 * sequence rather than a persistent dashboard sidebar. */
export interface HorizontalStep {
  id: string;
  label: string;
  complete?: boolean;
}

export function HorizontalSteps({
  steps,
  activeId,
  onSelect,
  className = "",
}: {
  steps: HorizontalStep[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Project steps" className={`min-w-0 max-w-full ${className}`}>
      <ol className="flex items-center gap-1 overflow-x-auto pb-1 sm:gap-2">
        {steps.map((step, index) => {
          const isActive = step.id === activeId;
          const stateWord = isActive ? "current step" : step.complete ? "completed" : "not started yet";
          return (
            <li key={step.id} className="flex flex-none items-center gap-1 sm:gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="h-px w-4 flex-none bg-[var(--color-border)] sm:w-6" />
              )}
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`${step.label}, ${stateWord}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                  isActive
                    ? "bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                    : step.complete
                      ? "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
                      : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-sunken)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] font-semibold ${
                    step.complete
                      ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
                      : isActive
                        ? "border-[var(--color-interactive)] text-[var(--color-interactive)]"
                        : "border-[var(--color-border-strong)] text-[var(--color-text-tertiary)]"
                  }`}
                >
                  {step.complete ? "✓" : index + 1}
                </span>
                <span className="whitespace-nowrap">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
