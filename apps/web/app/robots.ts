import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'

/**
 * Open to all bots — including AI training crawlers (GPTBot, ClaudeBot,
 * Google-Extended, CCBot, etc.). The threat we care about is human-driven
 * scraping with HTTP libraries / headless browsers, which doesn't respect
 * robots.txt anyway. That layer is handled by the edge middleware
 * (`apps/web/middleware.ts`).
 *
 * Explicit allow-rules are listed for the major AI assistants. The wildcard
 * `*` rule would cover them, but listing them by name makes the policy
 * auditable in Search Console / Bing Webmaster Tools and signals intent to
 * vendors that key off named UA entries.
 *
 * To opt OUT of a specific AI crawler later, change `allow: '/'` to
 * `disallow: '/'` for that UA — these vendors honour robots.txt by policy.
 */
const DISALLOWED_PATHS = ['/admin/', '/api/', '/_next/']

const AI_CRAWLERS = [
  'GPTBot',            // OpenAI training
  'ChatGPT-User',      // ChatGPT browsing / Operator
  'OAI-SearchBot',     // OpenAI SearchGPT
  'ClaudeBot',         // Anthropic training
  'Claude-Web',        // Anthropic browsing
  'anthropic-ai',      // legacy Anthropic UA
  'PerplexityBot',     // Perplexity training
  'Perplexity-User',   // Perplexity user-initiated fetches
  'Google-Extended',   // Gemini training (separate from Googlebot indexing)
  'GoogleOther',       // Google research / non-indexing
  'CCBot',             // Common Crawl (training corpus for many LLMs)
  'cohere-ai',         // Cohere training
  'Bytespider',        // ByteDance / Doubao training
  'Applebot-Extended', // Apple Intelligence training
  'Meta-ExternalAgent',// Meta AI training
  'Diffbot',           // Diffbot / commercial AI grounding
  'DuckAssistBot',     // DuckDuckGo AI
  'YouBot',            // You.com
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS },
      ...AI_CRAWLERS.map((ua) => ({ userAgent: ua, allow: '/', disallow: DISALLOWED_PATHS })),
    ],
    sitemap: [`${BASE}/sitemap.xml`, `${BASE}/news-sitemap.xml`],
    host: BASE,
  }
}
