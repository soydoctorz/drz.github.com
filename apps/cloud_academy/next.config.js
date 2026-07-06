/** @type {import('next').NextConfig} */
const basePath = '/apps/cloud_academy'

const nextConfig = {
  reactStrictMode: true,
  ...(process.env.DOCKER_BUILD === '1'
    ? { output: 'standalone' }
    : {
        output: 'export',
        basePath,
        assetPrefix: `${basePath}/`,
        trailingSlash: true,
        images: { unoptimized: true },
      }),
}

module.exports = nextConfig
