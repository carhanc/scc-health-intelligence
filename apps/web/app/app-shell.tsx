"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV_GROUPS, SECONDARY_ROUTES, groupForPath } from "./nav-items";
import { TrustSignal } from "./trust-signal";

function LogoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 shrink-0 self-center">
      <polygon points="3,7 12,3 13.5,13 4.5,15.5" fill="#a8d98c" />
      <polygon points="12,3 21,7.5 19.5,16.5 13.5,13" fill="#f2a950" />
      <polygon points="4.5,15.5 13.5,13 19.5,16.5 11,21.5" fill="#d4533a" />
    </svg>
  );
}

/** Slim top bar, four destinations, no sidebar. On the map page the
 * content is full-bleed under the bar; everywhere else it sits in a
 * centered column with sibling tabs and a footer. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const group = groupForPath(pathname);
  const isMapHome = pathname === "/";

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      <header
        className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ height: "var(--topbar-height)" }}
      >
        <div className="mx-auto flex h-full max-w-[1600px] items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="Santa Clara Health Intelligence, home"
            className="flex shrink-0 items-baseline gap-2.5 rounded-[var(--radius-sm)]"
          >
            <LogoMark />
            <span className="font-serif text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Santa Clara
            </span>
            <span className="hidden text-sm text-[var(--color-text-secondary)] sm:inline">Health Intelligence</span>
          </Link>

          <nav aria-label="Primary" className="ml-2 hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV_GROUPS.map((g) => {
                const active = group?.id === g.id;
                return (
                  <li key={g.id}>
                    <Link
                      href={g.href}
                      aria-current={active ? "page" : undefined}
                      title={g.description}
                      className={`rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {g.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/?search=1"
              className="hidden items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-interactive)] hover:text-[var(--color-interactive)] sm:inline-flex"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Search a place
            </Link>
            <Link
              href="/?search=1"
              aria-label="Search a place"
              className="rounded-[var(--radius-md)] p-2 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] sm:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-6 w-6" fill="none">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              className="rounded-[var(--radius-md)] p-2 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] lg:hidden"
            >
              <span className="sr-only">{menuOpen ? "Close navigation menu" : "Open navigation menu"}</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-6 w-6" fill="none">
                {menuOpen ? (
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                ) : (
                  <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="fixed inset-x-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-4 pt-2 shadow-[var(--shadow-md)] lg:hidden"
          style={{ top: "var(--topbar-height)" }}
        >
          <ul className="space-y-1">
            {NAV_GROUPS.map((g) => {
              const active = group?.id === g.id;
              return (
                <li key={g.id}>
                  <Link
                    href={g.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-[var(--radius-md)] px-3 py-3 ${
                      active ? "bg-[var(--color-interactive-subtle)]" : "hover:bg-[var(--color-surface-sunken)]"
                    }`}
                  >
                    <span className="block text-base font-medium text-[var(--color-text-primary)]">{g.label}</span>
                    <span className="block text-sm text-[var(--color-text-secondary)]">{g.description}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <SectionBar pathname={pathname} />

      <main id="main-content" className="min-w-0 flex-1">
        {children}
      </main>

      {!isMapHome && <SiteFooter />}
    </div>
  );
}

/** Sibling tabs for destinations that hold more than one page, or a way
 * back for pages that are no longer top-level destinations. */
function SectionBar({ pathname }: { pathname: string | null }) {
  const group = groupForPath(pathname);
  const secondary = pathname ? SECONDARY_ROUTES[pathname] : undefined;

  if (secondary) {
    return (
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-[var(--container-max)] items-center gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-10">
          <Link href={secondary.backHref} className="font-medium text-[var(--color-interactive)] hover:underline">
            &larr; {secondary.backLabel}
          </Link>
          <span aria-hidden="true" className="text-[var(--color-border-strong)]">
            /
          </span>
          <span className="text-[var(--color-text-secondary)]">{secondary.label}</span>
        </div>
      </div>
    );
  }

  if (!group || group.routes.length < 2) return null;

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-[var(--container-max)] px-4 sm:px-6 lg:px-10">
        <ul aria-label={`${group.label} sections`} className="-mb-px flex gap-6">
          {group.routes.map((r) => {
            const active = pathname === r.href || (pathname?.startsWith(`${r.href}/`) ?? false);
            return (
              <li key={r.href}>
                <Link
                  href={r.href}
                  aria-current={active ? "page" : undefined}
                  className={`block border-b-2 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-[var(--color-interactive)] text-[var(--color-text-primary)]"
                      : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {r.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-[var(--container-max)] px-4 py-8 text-sm text-[var(--color-text-secondary)] sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/data" className="hover:text-[var(--color-interactive)] hover:underline">
              Data &amp; methods
            </Link>
            <Link href="/accessibility" className="hover:text-[var(--color-interactive)] hover:underline">
              Accessibility
            </Link>
            <Link href="/privacy" className="hover:text-[var(--color-interactive)] hover:underline">
              Privacy
            </Link>
            <a
              href="https://github.com/carhanc/scc-health-intelligence/issues"
              className="hover:text-[var(--color-interactive)] hover:underline"
            >
              Contact / report an issue
            </a>
          </nav>
          <TrustSignal />
        </div>
        <p className="mt-5 text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          Santa Clara Health Intelligence is an open-data public-health intelligence platform. It supports
          prioritization and advocacy; it does not replace community engagement, official county systems, clinical
          judgment, or formal program evaluation. Built using publicly available data from Santa Clara County, HCAI,
          the U.S. Census Bureau, OpenStreetMap, and other cited sources.{" "}
          <strong className="font-semibold text-[var(--color-text-secondary)]">
            Developed by Arhan Chakravarthy. In collaboration with Santa Clara County Health Advisory Commission.
          </strong>
        </p>
      </div>
    </footer>
  );
}
