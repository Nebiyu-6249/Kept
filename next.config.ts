import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Lint is run as its own CI step; a lint warning should not fail the deploy build.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
  // Playwright drives the dev server over 127.0.0.1; without this Next warns on
  // every asset request. Dev only — it has no effect on a production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
