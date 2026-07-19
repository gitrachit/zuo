import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zuo/types", "@zuo/importer"],
};

export default nextConfig;
