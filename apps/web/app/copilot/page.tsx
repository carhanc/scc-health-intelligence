import { ComingSoonPage } from "../coming-soon";

export default function CopilotPage() {
  return (
    <ComingSoonPage
      title="Copilot"
      phase="Phase 8"
      whyItMatters="Not every question fits neatly into a search box. Copilot will let you ask a plain-language question and get an answer grounded in this platform's own data and any public documents you provide -- never a freehand guess."
      whatItWillDo={[
        "Answer plain-language questions using tested analytics tools and read-only queries, never freehand arithmetic.",
        "Work fully offline with a deterministic, rule-based mode -- no API key required for core functionality.",
        "Optionally use a connected AI provider for more flexible phrasing, only when you choose to enable it.",
        "Ground every numeric claim in a citation, and clearly say when a question can't be answered from available data.",
        "Treat any document you upload as data to search, never as instructions to follow.",
      ]}
    />
  );
}
