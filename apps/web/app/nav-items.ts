// Navigation model, v2 (docs/design/v2/design-brief.md).
//
// Nine sidebar destinations became four, grouped by the job the person is
// doing rather than by how the product was built. Every original route is
// still a real page (so every shared link and bookmark keeps working);
// routes in the same group are reached through sibling tabs rendered by the
// shell, not through separate top-level nav entries.

export interface NavRoute {
  href: string;
  /** Short label used for the sibling tab. */
  label: string;
}

export interface NavGroup {
  id: "map" | "care" | "act" | "about";
  label: string;
  /** Where the top-level link goes. */
  href: string;
  /** One line, shown as the link's tooltip and in the mobile menu. */
  description: string;
  /** Every route that belongs to this group, in tab order. */
  routes: NavRoute[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "map",
    label: "Map",
    href: "/",
    description: "See where health need is highest, and why.",
    routes: [{ href: "/", label: "Map" }],
  },
  {
    id: "care",
    label: "Getting to care",
    href: "/access-lab",
    description: "How people reach care, and how emergency care is used.",
    routes: [
      { href: "/access-lab", label: "Travel to care" },
      { href: "/utilization", label: "Emergency visits" },
    ],
  },
  {
    id: "act",
    label: "Take action",
    href: "/advocate",
    description: "Turn the evidence into a brief, or ask a question.",
    routes: [
      { href: "/advocate", label: "Build a brief" },
      { href: "/copilot", label: "Ask a question" },
    ],
  },
  {
    id: "about",
    label: "About the data",
    href: "/validate",
    description: "Where the numbers come from and how they were checked.",
    routes: [
      { href: "/validate", label: "Trust & methods" },
      { href: "/data", label: "Sources" },
    ],
  },
];

/** Routes that are real pages but deliberately not top-level destinations.
 * They keep working and are reached from inside the page that uses them. */
export const SECONDARY_ROUTES: Record<string, { groupId: NavGroup["id"]; label: string; backHref: string; backLabel: string }> = {
  "/prioritize": {
    groupId: "map",
    label: "Advanced ranking tools",
    backHref: "/",
    backLabel: "Back to the map",
  },
  "/explore": {
    groupId: "map",
    label: "Explore",
    backHref: "/",
    backLabel: "Back to the map",
  },
};

export function groupForPath(pathname: string | null): NavGroup | null {
  if (!pathname) return null;
  const secondary = SECONDARY_ROUTES[pathname];
  if (secondary) return NAV_GROUPS.find((g) => g.id === secondary.groupId) ?? null;
  if (pathname === "/") return NAV_GROUPS[0] ?? null;
  return (
    NAV_GROUPS.find((g) => g.id !== "map" && g.routes.some((r) => pathname === r.href || pathname.startsWith(`${r.href}/`))) ??
    null
  );
}
