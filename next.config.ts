import type { NextConfig } from "next";

// Encabezados estáticos. La CSP con nonce se agrega en src/proxy.ts (BUILD_PROMPT 14.1).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Sin AGENTS.md generado por `next dev`: las instrucciones del proyecto viven en CLAUDE.md y docs/AUTONOMIA.md.
  agentRules: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
