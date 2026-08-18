import type { NextConfig } from "next";

const isStandalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker image. Enabling it for
  // `next dev` writes .next/standalone on every run, which causes EPERM /
  // EACCES errors on Windows. Set NEXT_OUTPUT=standalone in the Docker build.
  ...(isStandalone ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Single-URL production deployment: the browser calls the API on the same
  // origin and the standalone server proxies those requests to the backend.
  // This keeps the Docker image self-contained (no extra nginx service needed).
  ...(isStandalone
    ? {
        env: { NEXT_PUBLIC_API_BASE_URL: "/api" },
        async rewrites() {
          const target = process.env.BACKEND_INTERNAL_URL;
          if (!target) return [];
          return [
            {
              source: "/api/:path*",
              destination: `${target.replace(/\/+$/, "")}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
