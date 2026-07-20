"use client";

import { useEffect, useState } from "react";

/** Defaults to `false` on the server and on first client render (so
 * hydration always matches the server-rendered markup), then upgrades
 * to the real value in a `useEffect` -- the standard, hydration-safe
 * pattern for viewport-dependent rendering. Used to choose between the
 * desktop-inline and mobile-bottom-sheet selected-geography layouts on
 * Explore without mounting both simultaneously (which would double the
 * profile/explain-score requests). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
