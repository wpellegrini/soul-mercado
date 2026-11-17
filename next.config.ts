import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
