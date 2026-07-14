"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort error boundary (Phase 9): only reached if the root layout
 * itself throws, so it must render its own <html>/<body> and cannot
 * assume anything else in the app (fonts, Tailwind, AppShell) is
 * working -- deliberately plain, inline-styled HTML rather than reusing
 * the design system.
 */
export default function GlobalError({
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
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Santa Clara Health Intelligence is unavailable</h1>
        <p style={{ marginTop: "0.5rem", color: "#555" }}>
          Something went wrong loading the application itself. This is a bug, not a data problem.
        </p>
        {error.digest && (
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#888" }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
