/** One short title, one short purpose sentence, and an optional compact
 * status or help link -- the shared opening for every major page, so the
 * primary interaction can begin immediately below it instead of behind a
 * multi-line methodology paragraph (docs/design/product-wide-flow-
 * simplification-research.md). Detailed methodology/limitations belong
 * in a page's own "About this analysis"/"How this works" disclosure, not
 * in this header. */
export function TaskPageHeader({
  title,
  purpose,
  status,
}: {
  title: string;
  purpose: string;
  status?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-text-secondary)]">{purpose}</p>
      </div>
      {status && <div className="flex-none">{status}</div>}
    </div>
  );
}
