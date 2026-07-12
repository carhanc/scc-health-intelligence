import { ComingSoonPage } from "../coming-soon";

export default function AccessLabPage() {
  return (
    <ComingSoonPage
      title="Access Lab"
      phase="Phase 6"
      whyItMatters="A health need only translates into a solvable problem if people can actually reach care. Access Lab focuses specifically on distance, travel time, and where a new resource would help the most people."
      whatItWillDo={[
        "Show walking, driving, and transit travel time to clinics, pharmacies, and other resources.",
        "Identify catchment areas and gaps in resource coverage across the county.",
        "Help plan mobile-clinic or new-site locations using a transparent, constraint-based optimizer.",
        "Always label results as a planning scenario, never a guaranteed outcome.",
      ]}
    />
  );
}
