import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
