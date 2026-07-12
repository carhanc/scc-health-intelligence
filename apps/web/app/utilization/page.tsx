import { ComingSoonPage } from "../coming-soon";

export default function UtilizationPage() {
  return (
    <ComingSoonPage
      title="Utilization"
      phase="Phase 7"
      whyItMatters="Screening scores describe risk and access barriers. Utilization looks at what actually happened -- emergency department visits and where patients came from -- as an independent check on those scores."
      whatItWillDo={[
        "Show emergency-department utilization patterns by geography, drawn from HCAI's public data.",
        "Show where patients seeking care at a given facility are coming from.",
        "Compare utilization patterns against the platform's screening scores as an independent validity check.",
        "Disclose the licensing terms and known limitations of the underlying HCAI data.",
      ]}
    />
  );
}
