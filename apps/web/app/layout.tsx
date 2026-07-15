import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "./app-shell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Santa Clara Health Intelligence",
  description:
    "Find where health needs, access barriers, and service gaps overlap in Santa Clara County. Explore public data, test transparent scenarios, and build evidence-backed questions for advocacy and planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        {/* Anonymous, aggregate page-view counts and real-user performance
            timing only (Vercel Web Analytics / Speed Insights) -- no custom
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
