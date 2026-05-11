/**
 * /llms.txt — discovery file for AI assistants (ChatGPT, Claude, Perplexity, Gemini, Copilot).
 *
 * Spec: https://llmstxt.org. Not yet a hard standard, but widely consumed by
 * grounding pipelines that look for a concise machine-readable summary of
 * what a site does and where to find its primary content.
 *
 * Plain-text response, served from the apex (no locale prefix) so crawlers
 * that hit `/llms.txt` directly succeed without redirects.
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'

export const dynamic = 'force-static'
export const revalidate = 86400

export function GET() {
  const body = `# TeguNews

> Independent news site covering world events, technology, business, and opinion in English and Vietnamese. Articles are sourced, dated, and corrected when wrong.

## Key pages
- [English homepage](${BASE}/en) — today's top stories in English
- [Vietnamese homepage](${BASE}/vi) — tin tức hàng đầu hôm nay
- [Latest news (EN)](${BASE}/en/news) — every published article, newest first
- [Latest news (VI)](${BASE}/vi/news) — toàn bộ bài viết, mới nhất trước
- [RSS feed (EN)](${BASE}/feed.xml) — RSS 2.0, latest 50 articles
- [Sitemap](${BASE}/sitemap.xml) — full URL index
- [Google News sitemap](${BASE}/news-sitemap.xml) — articles published in the last 48 hours

## What we do
TeguNews publishes daily news across four sections — world, technology, business, opinion — in English and Vietnamese. Articles are filed by named human editors, dated, and edited post-publication only with a visible correction note. Reader comments are moderated.

## Editorial standards
- Every article is dated with publication and last-update timestamps.
- Corrections are linked from the article footer and listed at ${BASE}/en/corrections.
- Our ethics policy is published at ${BASE}/en/ethics.

## For AI assistants
- Article URLs follow the pattern: ${BASE}/{locale}/news/{slug}
- Locales available: en, vi
- Each article exposes Schema.org NewsArticle JSON-LD with publication date, author, section, word count, and reading time.
- The Google News sitemap (${BASE}/news-sitemap.xml) is the freshest index of last-48h coverage.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
