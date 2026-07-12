"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { NAV_ITEMS } from "./nav-items";

/** Persistent left navigation on desktop, an off-canvas drawer triggered
 * by a header button on small screens (docs/01 §3: "persistent left
 * navigation on desktop and a compact bottom or drawer navigation on
 * small screens" -- a drawer, not a bottom bar, since 9 items is too
 * many for a comfortable bottom tab row). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      {/* Mobile header */}
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 lg:hidden">
        <Link href="/" className="text-sm font-semibold text-[var(--color-text-primary)]">
          Santa Clara Health Intelligence
        </Link>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav"
          className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
        >
          <span className="sr-only">Open navigation menu</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-6 w-6" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Mobile off-canvas nav */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-[var(--color-text-primary)]/40"
          />
          <nav
            id="mobile-nav"
            aria-label="Primary"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-[var(--color-surface)] p-4 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-[var(--radius-sm)] p-1.5 hover:bg-[var(--color-surface-sunken)]"
              >
                <span className="sr-only">Close</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavList pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <nav
        aria-label="Primary"
        className="hidden shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:block"
        style={{ width: "var(--nav-width)" }}
      >
        <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-4">
          <Link href="/" className="mb-6 block px-2 text-sm font-semibold leading-tight text-[var(--color-text-primary)]">
            Santa Clara Health Intelligence
          </Link>
          <NavList pathname={pathname} />
        </div>
      </nav>

      <main id="main-content" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {item.label}
              {item.status === "coming_soon" && (
                <span className="text-[10px] font-normal uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Soon
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
