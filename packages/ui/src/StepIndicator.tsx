/** A persistent, clickable step list for a multi-stage guided task --
 * modeled on the interaction pattern (not the visual styling) of the
 * U.S. Web Design System's step indicator and GOV.UK's task-list: shows
 * current/completed/upcoming state, lets a user jump backward to any
 * earlier step without losing work, and never hides the whole task
 * behind a rigid one-step-at-a-time wizard (every step's content stays
 * reachable). `status` communicates state through icon shape AND text,
 * never color alone. */
export interface Step {
  id: string;
  label: string;
  /** Short status word shown under the label, e.g. "2 facts selected" or
   * "Not started yet" -- lets a user see progress without visiting the step. */
  status?: string;
  complete?: boolean;
}

export function StepIndicator({
  steps,
  activeId,
  onSelect,
  className = "",
}: {
  steps: Step[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Project steps" className={className}>
      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isActive = step.id === activeId;
          const stateWord = isActive ? "current step" : step.complete ? "completed" : "not started yet";
          const accessibleName = `${step.label}${step.status ? `, ${step.status}` : ""}, ${stateWord}`;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={isActive ? "step" : undefined}
                aria-label={accessibleName}
                className={`flex w-full items-start gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-[var(--color-interactive-subtle)]"
                    : "hover:bg-[var(--color-surface-sunken)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] font-semibold ${
                    step.complete
                      ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
                      : isActive
                        ? "border-[var(--color-interactive)] text-[var(--color-interactive)]"
                        : "border-[var(--color-border-strong)] text-[var(--color-text-tertiary)]"
                  }`}
                >
                  {step.complete ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      isActive ? "text-[var(--color-interactive-hover)]" : "text-[var(--color-text-primary)]"
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.status && (
                    <span className="block text-xs text-[var(--color-text-secondary)]">{step.status}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
