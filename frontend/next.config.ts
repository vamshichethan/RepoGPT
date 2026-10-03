import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' output is used for Docker deployments only.
  // For Vercel, this should be commented out — Vercel builds natively.
  // output: 'standalone',

  // Allow images from any domain (needed for GitHub avatar URLs, etc.)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "https://repogpt-backend-shf2.onrender.com";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl.replace(/\/+$/, '')}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
