"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@scc-health/ui";

/**
 * Route-segment error boundary (Phase 9). Renders inside the root
 * layout, so navigation stays visible and usable even when a page's own
 * content throws -- a user can still get to a working page, never stuck
 * looking at a blank screen or Next's raw stack trace.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-16 sm:px-6 lg:px-10">
      <ErrorState
        title="Something went wrong on this page"
        description={
          <>
            This is a bug in the application, not a data problem. Try again, or head back to the
            overview.
            {error.digest && (
              <span className="mt-2 block text-xs text-[var(--color-text-tertiary)]">
                Reference: {error.digest}
              </span>
            )}
          </>
        }
        action={{ label: "Try again", onClick: reset }}
        secondaryAction={{ label: "Return to overview", href: "/" }}
      />
    </div>
  );
}
