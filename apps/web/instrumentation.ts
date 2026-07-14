// Server-side (Node.js runtime) error monitoring (Phase 9). Mirrors
// instrumentation-client.ts's no-op-when-unset behavior for the
// server/edge rendering paths -- see that file's comment for the scope
// decision (no source-map upload, capture-only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? "production",
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  }
}
