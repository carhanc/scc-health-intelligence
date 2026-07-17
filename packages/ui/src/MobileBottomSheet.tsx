import type { ReactNode } from "react";
import { Dialog } from "./Dialog";

/** A named wrapper around `Dialog`'s `variant="bottom"` for mobile
 * selection flows (e.g. Explore's map-tap-to-detail on narrow
 * viewports) -- same native-<dialog> focus trap and Escape-to-close as
 * every other Dialog use, anchored to the bottom instead of centered or
 * side-drawer. */
export function MobileBottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} variant="bottom">
      {children}
    </Dialog>
  );
}
