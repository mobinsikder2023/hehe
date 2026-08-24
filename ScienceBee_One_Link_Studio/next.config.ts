import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  },

  serverExternalPackages: [
    "@resvg/resvg-js"
  ]
};

export default nextConfig;
