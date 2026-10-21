/**
 * Display-layer cleanup for prose that comes from the API. The stored data is
 * never changed; only how a sentence reads on screen. Spaced double hyphens
 * and em or en dashes read as a typed-out aside, so each becomes the
 * punctuation a person would write: a comma before a lowercase continuation,
 * a colon before a capitalized one (a title and its subtitle), and a plain
 * hyphen inside a number range.
 */
export function cleanDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1-$2")
    .replace(/\s*(?: -- |\u2014|\u2013)\s*(?=(\S))/g, (_m, next: string) =>
      /[a-z0-9(]/.test(next) ? ", " : ": ",
    );
}

/** Applies cleanDashes to every string inside a parsed JSON value. Returns the
 * same object when nothing needed cleaning, and never walks map geometry. */
export function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return cleanDashes(value) as unknown as T;
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "number") return value;
    let changed = false;
    const next = value.map((v) => {
      const c = cleanDeep(v);
      if (c !== v) changed = true;
      return c;
    });
    return (changed ? next : value) as unknown as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = k === "geometry" ? v : cleanDeep(v);
      if (c !== v) changed = true;
      out[k] = c;
    }
    return (changed ? out : value) as T;
  }
  return value;
}
