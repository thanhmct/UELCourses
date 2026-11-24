import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  distDir: process.env.UEL_PREVIEW_DIST_DIR || ".next",
  // Used by docker/ (standalone server bundle)
  output: "standalone",
  env: {
    // NEXT_PUBLIC_API_URL is inlined at build time; default for local dev.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    // Keep the flag compile-time constant so production builds can discard mock imports.
    NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS || "false",
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3100",
  },
};

export default nextConfig;
