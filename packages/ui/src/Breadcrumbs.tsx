export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-text-secondary)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-[var(--color-border-strong)]">
                /
              </span>
            )}
            {item.href && i < items.length - 1 ? (
              <a href={item.href} className="hover:text-[var(--color-interactive)] hover:underline">
                {item.label}
              </a>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="text-[var(--color-text-primary)]">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
