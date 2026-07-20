"use client";

/** The very first screen -- extremely simple by design (docs/design/
 * advocate-flow-simplification-visual-review.md "THE FIRST SCREEN"). No
 * scenario cards, no audience, no output types, no project summary, no
 * search box yet -- just one question and two large choices. Clicking
 * either choice moves to its own dedicated next screen. */
export function LandingChoice({
  onChooseCommunity,
  onChooseDocument,
}: {
  onChooseCommunity: () => void;
  onChooseDocument: () => void;
}) {
  return (
    <div className="space-y-8">
      <p className="text-base font-medium text-[var(--color-text-primary)]">Where would you like to start?</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onChooseCommunity}
          aria-label="Choose a community: Find a place and review evidence from the platform."
          className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 text-left transition-colors hover:border-[var(--color-interactive)] hover:bg-[var(--color-interactive-subtle)]"
        >
          <p className="text-base font-semibold text-[var(--color-text-primary)]">Choose a community</p>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
            Find a place and review evidence from the platform.
          </p>
        </button>

        <button
          type="button"
          onClick={onChooseDocument}
          aria-label="Review a document: Upload a document and find passages that may support your project."
          className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 text-left transition-colors hover:border-[var(--color-interactive)] hover:bg-[var(--color-interactive-subtle)]"
        >
          <p className="text-base font-semibold text-[var(--color-text-primary)]">Review a document</p>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
            Upload a document and find passages that may support your project.
          </p>
        </button>
      </div>
    </div>
  );
}

/** Shown instead of the generic two-choice landing when the user arrived
 * from another page's "Add to advocacy project" click, with real
 * evidence already carried in -- never make them repeat a place
 * selection another page already supplied. */
export function CrossPageArrival({
  placeLabel,
  factCount,
  isLoadingCount,
  sourcePage,
  onReviewEvidence,
  onAddMoreInformation,
}: {
  placeLabel: string;
  factCount: number;
  /** True while the real count is still being fetched -- shows a plain
   * "ready to review" line without a specific number rather than
   * briefly claiming "0 facts" before the fetch resolves (found live). */
  isLoadingCount: boolean;
  sourcePage: string | null;
  onReviewEvidence: () => void;
  onAddMoreInformation: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-base font-medium text-[var(--color-text-primary)]">
          {sourcePage ? `Evidence was added from ${sourcePage}` : "Evidence was added"}
        </p>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          {isLoadingCount
            ? `Evidence about ${placeLabel} is ready to review.`
            : `${factCount === 1 ? "1 fact" : `${factCount} facts`} about ${placeLabel} ${factCount === 1 ? "is" : "are"} ready to review.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReviewEvidence}
          className="rounded-[var(--radius-md)] bg-[var(--color-interactive)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)]"
        >
          Review the evidence
        </button>
        <button
          type="button"
          onClick={onAddMoreInformation}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
        >
          Add more information
        </button>
      </div>
    </div>
  );
}
