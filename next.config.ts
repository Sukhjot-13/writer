import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer is a server-side (Node) package — keep it out of the
  // bundler's server graph so renderToBuffer works in route handlers (FR-14/15).
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
