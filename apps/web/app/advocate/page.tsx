import { ComingSoonPage } from "../coming-soon";

export default function AdvocatePage() {
  return (
    <ComingSoonPage
      title="Advocate"
      phase="Phase 8"
      whyItMatters="Understanding a problem is only useful if you can put it in front of the people who can act on it. Advocate will turn what you found in Explore and Prioritize into a document you can actually bring to a meeting."
      whatItWillDo={[
        "Generate a meeting brief, memo, or talking-points draft from the evidence you've gathered.",
        "Attach a citation to every number, so every claim in the draft traces back to its source.",
        "Propose evidence-backed questions you could ask county staff about a specific area.",
        "Export the result as an accessible document you can share or print.",
      ]}
    />
  );
}
