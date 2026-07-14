import { EmptyState } from "@scc-health/ui";

/** Custom 404 (Phase 9) -- replaces Next.js's generic default with
 * something that matches the rest of the app and points somewhere real. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-16 sm:px-6 lg:px-10">
      <EmptyState
        title="Page not found"
        description="There's nothing at this address. Try one of the links in the navigation, or return to the overview."
        secondaryAction={{ label: "Return to overview", href: "/" }}
      />
    </div>
  );
}
