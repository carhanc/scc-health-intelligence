import { ComingSoonPage } from "../coming-soon";

export default function ValidatePage() {
  return (
    <ComingSoonPage
      title="Validate"
      phase="Phase 7"
      whyItMatters="Every score and claim on this platform should be checkable. Validate will be the home for methods documentation, uncertainty explanations, data-quality reporting, and independent checks against outcomes the scores didn't use to build themselves."
      whatItWillDo={[
        "Document, in plain language, exactly how each score and domain is calculated.",
        "Explain what the uncertainty and sensitivity indicators shown elsewhere in the platform mean.",
        "Report data-quality and coverage issues across every source, not just the ones behind a given score.",
        "Show independent correlation checks against outcomes the scores were not built from, with tautological comparisons flagged and excluded.",
        "Publish this platform's accessibility conformance and privacy practices.",
      ]}
    />
  );
}
