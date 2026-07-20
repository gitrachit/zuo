import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zuo/types", "@zuo/importer", "@zuo/charges", "@zuo/analytics"],
};

export default nextConfig;
