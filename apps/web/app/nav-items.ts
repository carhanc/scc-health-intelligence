// Canonical navigation destinations (DEC-036: 9 items, matching
// docs/00_PRODUCT_CHARTER.md §8.1 exactly). Only Overview and Explore are
// fully built in Phase 5; the rest are truthful "coming in a later
// phase" shells (DEC-037), never broken links.

export type NavStatus = "available" | "coming_soon";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  description: string;
  status: NavStatus;
  /** Which build phase (docs/07_BUILD_PHASES.md) delivers this page. */
  phase?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/",
    description: "Start here: countywide picture and where to go next.",
    status: "available",
  },
  {
    id: "explore",
    label: "Explore",
    href: "/explore",
    description: "Search a place and see its health, access, and resource profile.",
    status: "available",
  },
  {
    id: "prioritize",
    label: "Prioritize",
    href: "/prioritize",
    description: "Rank communities by a specific issue, with sensitivity and stability shown.",
    status: "available",
  },
  {
    id: "access-lab",
    label: "Access Lab",
    href: "/access-lab",
    description: "Travel time, resource proximity, and mobile-clinic site planning.",
    status: "available",
  },
  {
    id: "utilization",
    label: "Utilization",
    href: "/utilization",
    description: "Emergency-department utilization and patient-flow evidence.",
    status: "available",
  },
  {
    id: "validate",
    label: "Validate",
    href: "/validate",
    description: "Methods, uncertainty, data quality, and independent validation.",
    status: "available",
  },
  {
    id: "advocate",
    label: "Advocate",
    href: "/advocate",
    description: "Turn evidence into a brief, staff questions, or talking points.",
    status: "available",
  },
  {
    id: "copilot",
    label: "Copilot",
    href: "/copilot",
    description: "Ask a plain-language question and get a grounded, cited answer.",
    status: "available",
  },
  {
    id: "data",
    label: "Data",
    href: "/data",
    description: "Every data source, its status, freshness, and license.",
    status: "available",
  },
];
