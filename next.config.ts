import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // No ESLint config is set up: `next lint` is deprecated in 15.5 and TypeScript
    // strict plus `npm run typecheck` covers what mattered here. This keeps a
    // future lint config from silently gating deploys.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
  // Playwright drives the dev server over 127.0.0.1; without this Next warns on
  // every asset request. Dev only — it has no effect on a production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
