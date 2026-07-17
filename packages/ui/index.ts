// Shared design-system components (docs/design/design-system.md,
// docs/design/component-inventory.md). Consumed via Next.js
// transpilePackages -- see DEC-039.

export { Button } from "./src/Button";
export type { ButtonProps } from "./src/Button";

export {
  Badge,
  StabilityBadge,
  FreshnessBadge,
  DataModeBadge,
} from "./src/Badge";
export type { BadgeTone, BadgeProps, StabilityLabel, FreshnessState } from "./src/Badge";

export { Skeleton, SkeletonText, LoadingRegion } from "./src/Skeleton";
export { EmptyState, ErrorState } from "./src/StateMessage";
export { Card } from "./src/Card";
export { Tabs, TabPanel } from "./src/Tabs";
export type { TabItem } from "./src/Tabs";
export { SegmentedControl } from "./src/SegmentedControl";
export type { SegmentedOption } from "./src/SegmentedControl";
export { Breadcrumbs } from "./src/Breadcrumbs";
export type { Crumb } from "./src/Breadcrumbs";
export { PercentileBar } from "./src/PercentileBar";
export { Dialog } from "./src/Dialog";
export { DataTable } from "./src/DataTable";
export { Tooltip } from "./src/Tooltip";

export { PageIntro } from "./src/PageIntro";
export { PlainLanguageDefinition } from "./src/PlainLanguageDefinition";
export { MetricCard } from "./src/MetricCard";
export { MetricDirectionLabel } from "./src/MetricDirectionLabel";
export { RankContext } from "./src/RankContext";
export { ComparisonDelta } from "./src/ComparisonDelta";
export { BackendWakeState } from "./src/BackendWakeState";
export { HowCalculatedDisclosure } from "./src/HowCalculatedDisclosure";
export { GuidedNextStep } from "./src/GuidedNextStep";
export { MobileBottomSheet } from "./src/MobileBottomSheet";
export { GlossaryTerm } from "./src/GlossaryTerm";

export {
  CHART_PALETTE,
  CONCERN_SCALE,
  CONCERN_NO_DATA_COLOR,
  COLOR,
  scoreColorExpression,
} from "./src/tokens";
