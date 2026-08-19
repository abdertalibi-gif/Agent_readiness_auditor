import type { NextConfig } from "next";

const isStandalone = process.env.NEXT_OUTPUT === "standalone";
// Vercel sets VERCEL=1 for every build. On Vercel the backend is another
// service of the same project and /api/* is routed to it by vercel.json, so
// the browser must call the API on the same origin instead of localhost.
const isVercel = process.env.VERCEL === "1";

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
  // On Vercel the same-origin /api base is used and vercel.json routes it to
  // the backend service.
  ...(isStandalone || isVercel
    ? {
        env: { NEXT_PUBLIC_API_BASE_URL: "/api" },
        ...(isStandalone
          ? {
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
      }
    : {}),
};

export default nextConfig;
