"use client";

import { SearchPanel } from "../explore/search-panel";
import type { SelectedGeography } from "../explore/selection";

/** "Choose a community" -- search only. No focus/scenario picker, no
 * summary rail, no empty evidence state visible here at all (docs/design/
 * advocate-flow-simplification-visual-review.md "PLACE STEP"). Selecting
 * a result is handled entirely by the parent, which advances to the
 * Focus question immediately. */
export function PlaceStep({ onSelectGeography }: { onSelectGeography: (selection: SelectedGeography) => void }) {
  return <SearchPanel selected={null} onSelect={onSelectGeography} showMapHint={false} />;
}
