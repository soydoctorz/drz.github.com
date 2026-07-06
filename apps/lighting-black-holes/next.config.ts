import type { NextConfig } from "next";

const basePath = "/apps/lighting-black-holes";

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === "1"
    ? { output: "standalone" }
    : {
        output: "export",
        basePath,
        assetPrefix: `${basePath}/`,
        trailingSlash: true,
        images: { unoptimized: true },
        env: {
          NEXT_PUBLIC_BASE_PATH: basePath,
        },
      }),
};

export default nextConfig;
