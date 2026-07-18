"use client";

import { Card } from "@scc-health/ui";
import { SearchPanel } from "../explore/search-panel";
import type { SelectedGeography } from "../explore/selection";
import { OUTPUT_TYPES } from "./output-types";

/** The inviting empty state shown before a project has any place,
 * evidence, or document -- per docs/design/advocate-intuitive-workspace-
 * research.md, a first-time visitor should never land on configuration
 * fields before choosing a path. Two entry routes plus a preview of
 * what can be created, no fields to fill in yet. */
export function StartProjectLanding({
  onSelectGeography,
  onStartFromDocument,
}: {
  onSelectGeography: (selection: SelectedGeography) => void;
  onStartFromDocument: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Start an advocacy project</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Build a clear, sourced document using evidence from across Santa Clara Health Intelligence.
        </p>
      </div>

      {/* Stacked, not side-by-side -- a shared-width two-column grid left
          the search input+button too cramped to use comfortably inside
          this page's 3-zone desktop layout (found via live testing: a
          flex-1 input with no min-w-0 was overflowing its ~260px column
          entirely, a real bug fixed in search-panel.tsx; even after that
          fix, a half-width card is still tighter than a search box
          deserves). Each card gets the full main-content width instead. */}
      <div className="space-y-3">
        <Card>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Start with a place</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Choose a community and find evidence about it.
          </p>
          <div className="mt-3 max-w-md">
            <SearchPanel selected={null} onSelect={onSelectGeography} />
          </div>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Start with a document</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Upload a meeting agenda, staff report, or memo and find evidence already relevant to it.
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={onStartFromDocument}
              className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
            >
              Find useful evidence in a document →
            </button>
          </div>
        </Card>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          What you can create
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OUTPUT_TYPES.map((t) => (
            <div key={t.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{t.label}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{t.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
