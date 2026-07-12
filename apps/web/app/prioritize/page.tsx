import { ComingSoonPage } from "../coming-soon";

export default function PrioritizePage() {
  return (
    <ComingSoonPage
      title="Prioritize"
      phase="Phase 6"
      whyItMatters="Explore lets you look up a place and see its overall picture. Prioritize will flip that around: choose a specific issue or goal, and see which communities the data suggests looking at first."
      whatItWillDo={[
        "Rank communities by a single issue you choose, instead of the default balanced scenario.",
        "Show how sensitive that ranking is to the assumptions and weights behind it.",
        "Screen candidate areas for a specific intervention goal, with drivers and data confidence shown for each.",
        "Let you export the exact scenario configuration and results you reviewed.",
      ]}
    />
  );
}
