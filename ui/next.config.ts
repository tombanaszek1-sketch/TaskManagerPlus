import type { NextConfig } from "next";

const config: NextConfig = {
  // The desktop host serves the exported files from disk through a WebView2 virtual host.
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
  reactStrictMode: true,
};

export default config;
