// Browser-side error monitoring (Phase 9). A genuine no-op when
// NEXT_PUBLIC_SENTRY_DSN is unset -- "core functionality works without
// paid API keys" applies to observability tooling too, not just AI.
// Deliberately minimal: no session replay, no source-map upload (that
// needs a build-time auth token most deployments won't have configured
// on day one) -- just unhandled client-side error capture, which is the
// highest-value, lowest-risk piece.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
