import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "./app-shell";

// Public Sans for UI and data (neutral, built for government sites, real
// tabular figures); Newsreader for headlines and large numerals, a screen
// serif with optical sizes. See docs/design/v2/design-brief.md.
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Santa Clara Health Intelligence",
    template: "%s | Santa Clara Health Intelligence",
  },
  description:
    "Where in Santa Clara County does health need the most support, and why? An open, fully cited map of every neighborhood, built from public data, with the method and uncertainty shown.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${publicSans.variable} ${newsreader.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        {/* Anonymous, aggregate page-view counts and real-user performance
            timing only (Vercel Web Analytics / Speed Insights), no custom
            events, no cookies, no tracking of search terms, uploaded
            filenames, or anything typed into Advocate/Copilot. Both
            components are no-ops outside a real Vercel deployment, so local
            dev and any other host see no network calls from these. See the
            Privacy page for the full disclosure. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
