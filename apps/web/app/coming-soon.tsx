import Link from "next/link";
import { Badge } from "@scc-health/ui";

/**
 * A truthful "not built yet" destination -- never a 404, never fabricated
 * content. States plainly what the page will contain and which build
 * phase delivers it (DEC-037), and points the user at what already works.
 */
export function ComingSoonPage({
  title,
  phase,
  whatItWillDo,
  whyItMatters,
}: {
  title: string;
  phase: string;
  whatItWillDo: string[];
  whyItMatters: string;
}) {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">{title}</h1>
          <Badge tone="caution" dot>
            Coming in {phase}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{whyItMatters}</p>

        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">What this page will do</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[var(--color-text-secondary)]">
            {whatItWillDo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
          In the meantime, you can{" "}
          <Link href="/explore" className="text-[var(--color-interactive)] underline underline-offset-2">
            explore a community
          </Link>{" "}
          or{" "}
          <Link href="/" className="text-[var(--color-interactive)] underline underline-offset-2">
            return to the overview
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
