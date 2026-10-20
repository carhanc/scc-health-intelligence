"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Long explanatory text, trimmed to two lines with a More/Less toggle. The
 * full text is always in the page for screen readers; only its visual height
 * is limited until asked. */
export function ClampedText({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clampable, setClampable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !open) setClampable(el.scrollHeight > el.clientHeight + 1);
  }, [children, open]);

  return (
    <div className={className}>
      <p ref={ref} className={`text-sm text-[var(--color-text-secondary)] ${open ? "" : "line-clamp-2"}`}>
        {children}
      </p>
      {(clampable || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-0.5 text-sm font-medium text-[var(--color-interactive)] hover:underline"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
