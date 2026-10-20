"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * A small floating "Who built this?" button for the map page, which has no
 * footer. Hover or focus previews it on a computer; a tap or click pins it
 * open (phones, keyboards). Escape or a click elsewhere closes it.
 */
/** The caller positions it with `absolute` (which also anchors the card). */
export function AboutBadge({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();
  const open = pinned || hovered;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close this first; do not also leave the neighborhood behind it.
      e.stopPropagation();
      setPinned(false);
      setHovered(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function enter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHovered(true);
  }
  function leave() {
    // A short grace period so moving from the button to the card does not flicker.
    closeTimer.current = setTimeout(() => setHovered(false), 150);
  }

  return (
    <div
      ref={rootRef}
      className={className}
      style={style}
      onPointerEnter={(e) => e.pointerType === "mouse" && enter()}
      onPointerLeave={(e) => e.pointerType === "mouse" && leave()}
    >
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="About this platform"
          className="animate-panel-in absolute bottom-full left-0 mb-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4 text-sm shadow-[var(--shadow-lg)]"
        >
          <p className="font-semibold leading-snug text-[var(--color-text-primary)]">
            Developed by Arhan Chakravarthy. In collaboration with Santa Clara County Health Advisory Commission.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            Built on public data. It supports prioritization and advocacy and does not replace community
            engagement, official county systems, or clinical judgment.
          </p>
          <nav aria-label="About links" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
            <Link href="/data" className="text-[var(--color-interactive)] hover:underline">
              Data &amp; methods
            </Link>
            <Link href="/accessibility" className="text-[var(--color-interactive)] hover:underline">
              Accessibility
            </Link>
            <Link href="/privacy" className="text-[var(--color-interactive)] hover:underline">
              Privacy
            </Link>
          </nav>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setPinned((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface)] py-2 pl-2.5 pr-4 text-sm font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-md)] transition-colors hover:text-[var(--color-interactive)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-interactive)] text-xs font-semibold text-[var(--color-text-on-interactive)]"
        >
          ?
        </span>
        Who built this?
      </button>
    </div>
  );
}
