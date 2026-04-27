import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'tegunews.com', pathname: '/r2/**' },
      { protocol: 'https', hostname: 'www.gravatar.com' },
    ],
    unoptimized: false,
  },
}

initOpenNextCloudflareForDev()

export default withNextIntl(nextConfig)
