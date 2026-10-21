import { Suspense } from "react";
import { MapWorkspace } from "./map-home/map-workspace";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center bg-[var(--color-surface-sunken)] text-sm text-[var(--color-text-secondary)]"
          style={{ height: "calc(100dvh - var(--topbar-height))" }}
        >
          Loading the map&hellip;
        </div>
      }
    >
      <MapWorkspace />
    </Suspense>
  );
}
