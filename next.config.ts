import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_HOSTED_DEMO: process.env.VERCEL === "1" || process.env.LASER_FOCUS_HOSTED_DEMO === "1" ? "1" : "0" },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
