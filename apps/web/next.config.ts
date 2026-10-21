import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Never expose data-source or AI provider secrets to the client bundle.
  // Only NEXT_PUBLIC_-prefixed variables are ever readable in the browser,
  // and none are defined by this project — all secrets stay server-side
  // in apps/api, per docs/09_SECURITY_PRIVACY_GOVERNANCE.md.

  // @scc-health/ui ships raw TypeScript source, not a prebuilt package
  // (DEC-039) -- Next.js compiles it as part of this app's own build.
  transpilePackages: ["@scc-health/ui"],

  // Explore was merged into the map home page. Same query string, same
  // behavior, so every previously shared /explore?... link still works.
  async redirects() {
    return [{ source: "/explore", destination: "/", permanent: false }];
  },
};

export default nextConfig;
