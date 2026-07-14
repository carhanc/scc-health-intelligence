import { ImageResponse } from "next/og";

// Generated favicon (Phase 9) -- no static asset existed before this;
// Next.js serves this at /icon and wires it up as the site favicon
// automatically. Uses the same teal interactive color as the rest of
// the design system (packages/ui/src/tokens.ts's `interactive`).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b6e75",
          borderRadius: 6,
          color: "white",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
