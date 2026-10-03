import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from any domain (needed for GitHub avatar URLs, etc.)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
