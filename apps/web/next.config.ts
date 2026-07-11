import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Never expose data-source or AI provider secrets to the client bundle.
  // Only NEXT_PUBLIC_-prefixed variables are ever readable in the browser,
  // and none are defined by this project — all secrets stay server-side
  // in apps/api, per docs/09_SECURITY_PRIVACY_GOVERNANCE.md.
};

export default nextConfig;
