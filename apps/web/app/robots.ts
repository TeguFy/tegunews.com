import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'

/**
 * Open to all bots — including AI training crawlers (GPTBot, ClaudeBot,
 * Google-Extended, CCBot, etc.). The threat we care about is human-driven
 * scraping with HTTP libraries / headless browsers, which doesn't respect
 * robots.txt anyway. That layer is handled by the edge middleware
 * (`apps/web/middleware.ts`) which 403s `script`-tier user agents.
 *
 * If you ever want to opt OUT of a specific AI crawler, add a rule like:
 *   { userAgent: 'GPTBot', disallow: '/' }
 * — these vendors honour robots.txt by policy.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/_next/'],
      },
    ],
    sitemap: [`${BASE}/sitemap.xml`, `${BASE}/news-sitemap.xml`],
    host: BASE,
  }
}
