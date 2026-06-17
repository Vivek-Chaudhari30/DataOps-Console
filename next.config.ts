import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile elsewhere on the machine would
  // otherwise make Next infer the wrong root directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
