import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  typescript: {
    // Type-checking runs out of memory in the build environment.
    // Types are still checked via `tsc --noEmit` in the validate script.
    ignoreBuildErrors: true,
  },
  // Expose VERCEL_PROJECT_PRODUCTION_URL to client-side code
  env: {
    NEXT_PUBLIC_VERCEL_PRODUCTION_URL:
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
  },
  allowedDevOrigins: [
    "*.ngrok.app",
    "*.neynar.com",
    "*.neynar.app",
    "*.studio.neynar.com",
    "*.dev-studio.neynar.com",
    "*.nip.io",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.imgur.com",
      },
      {
        protocol: "https",
        hostname: "neynar-public.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "cdn.neynar.com",
      },
    ],
  },
  devIndicators: false,
  reactCompiler: true,
  ...(process.env.DISABLE_TURBOPACK_ROOT
    ? {}
    : {
        turbopack: {
          root: "/monorepo/packages/service.miniapp-generator/",
        },
      }),
};

export default nextConfig;
