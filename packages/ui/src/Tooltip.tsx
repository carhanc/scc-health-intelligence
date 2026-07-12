"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

/** A short supplementary label, shown on hover AND keyboard focus (never
 * hover-only, docs/01 §14 "no hover-only information"). Only for brief
 * clarifications -- essential information belongs in visible text, per
 * docs/01 §2's "tooltips as the only place essential information
 * appears" anti-pattern. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-xs -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-2.5 py-1.5 text-xs text-white shadow-[var(--shadow-md)]"
        >
          {label}
        </span>
      )}
    </span>
  );
}
