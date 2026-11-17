import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security";

const nextConfig: NextConfig = {
  poweredByHeader: false, // não anuncia a tecnologia usada
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Sistema com login em todas as telas: renderização sempre dinâmica,
  // sem o modo Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
