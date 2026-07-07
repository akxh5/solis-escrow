import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16+ default bundler)
  turbopack: {
    resolveAlias: {
      // Stub out Node.js built-ins that stellar-sdk / stellar-wallets-kit
      // reference but that are not available in the browser.
      fs: { browser: "./src/lib/stubs/empty.js" },
      net: { browser: "./src/lib/stubs/empty.js" },
      tls: { browser: "./src/lib/stubs/empty.js" },
      path: { browser: "./src/lib/stubs/empty.js" },
      os: { browser: "./src/lib/stubs/empty.js" },
    },
  },
};

export default nextConfig;
