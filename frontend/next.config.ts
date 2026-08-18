import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker image. Enabling it for
  // `next dev` writes .next/standalone on every run, which causes EPERM /
  // EACCES errors on Windows. Set NEXT_OUTPUT=standalone in the Docker build.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
