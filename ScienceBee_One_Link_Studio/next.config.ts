import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  },

  // Native modules must NOT be bundled by webpack — Next loads them
  // directly at runtime on the server instead.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "sharp"
  ]
};

export default nextConfig;
