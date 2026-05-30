/** @type {import('next').NextConfig} */
const repo = 'FlagWaver'
const isProd = process.env.NODE_ENV === 'production'
const isGithubActions = process.env.GITHUB_ACTIONS === 'true'
// When deploying via GitHub Actions to a project page
// (https://<user>.github.io/<repo>), basePath must be /<repo>.
// Override with NEXT_PUBLIC_BASE_PATH for custom domains or user/org pages.
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (isProd && isGithubActions ? `/${repo}` : '')

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
}

export default nextConfig
