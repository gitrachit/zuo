import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zuo/types", "@zuo/importer", "@zuo/charges"],
};

export default nextConfig;
