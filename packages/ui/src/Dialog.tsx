"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** "side" renders as a right-anchored drawer (evidence panels); "center"
   * renders as a centered modal; "bottom" renders as a bottom-anchored
   * sheet (mobile tract-selection flows, MobileBottomSheet). */
  variant?: "side" | "center" | "bottom";
}

/** Built on the native <dialog> element, which provides a real focus
 * trap, Escape-to-close, and a backdrop for free -- more reliable than a
 * hand-rolled focus-trap implementation. */
export function Dialog({ open, onClose, title, children, variant = "center" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  const positionClasses =
    variant === "side"
      ? "fixed inset-y-0 right-0 m-0 h-full max-h-full w-full max-w-md rounded-l-[var(--radius-lg)]"
      : variant === "bottom"
        ? "fixed inset-x-0 bottom-0 m-0 max-h-[85vh] w-full rounded-t-[var(--radius-lg)]"
        : "max-w-lg rounded-[var(--radius-lg)]";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`border border-[var(--color-border)] bg-[var(--color-surface)] p-0 shadow-[var(--shadow-lg)] backdrop:bg-[var(--color-text-primary)]/40 ${positionClasses}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {/* tabIndex makes the scrollable region itself keyboard-operable
            (arrow/Page keys scroll it directly) -- a scrollable region
            that can only be reached by tabbing through its focusable
            descendants fails WCAG 2.1.1 for content that has none, or
            content past the last focusable child (axe-core
            scrollable-region-focusable). */}
        <div tabIndex={0} className="flex-1 overflow-y-auto px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]">
          {children}
        </div>
      </div>
    </dialog>
  );
}
