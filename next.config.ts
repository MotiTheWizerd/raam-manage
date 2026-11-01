import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["baileys"],
  // Dev (:3001) opened from another device — a phone or laptop on the building
  // network, or over Tailscale. Without this the dev server blocks its scripts
  // and live-reload socket, so the page shows but no button works.
  allowedDevOrigins: ["10.0.0.164", "100.124.233.12"],
};

export default nextConfig;
