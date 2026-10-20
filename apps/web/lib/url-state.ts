/**
 * Updates only the query string of the current page, through the browser's
 * history API (which Next.js integrates with `useSearchParams`). Used instead
 * of `router.push` for query-only changes because, on a production build,
 * `router.push("/")` after loading a deep link such as `/?geography=tract&id=...`
 * silently does nothing, which broke "Back to the county". It is also faster:
 * no server round trip for a change the client already knows how to render.
 */
export function setQuery(pathname: string, params: URLSearchParams, mode: "push" | "replace" = "push"): void {
  const qs = params.toString();
  const url = qs ? `${pathname}?${qs}` : pathname;
  if (mode === "replace") window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}
