/**
 * RSS 2.0 feed for the latest 50 published articles (English locale).
 */
import { eq, desc, and } from 'drizzle-orm'
import { posts, postTranslations } from '@teguns/db'
import { getDb } from '@/lib/db'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
const FEED_LOCALE = 'en'

export const dynamic = 'force-dynamic'
export const revalidate = 1800

export async function GET() {
  const db = await getDb()

  const rows = await db.select({
    publishedAt: posts.publishedAt,
    updatedAt: posts.updatedAt,
    featuredImage: posts.featuredImage,
    title: postTranslations.title,
    slug: postTranslations.slug,
    excerpt: postTranslations.excerpt,
    seoDesc: postTranslations.seoDesc,
  })
    .from(posts)
    .innerJoin(postTranslations, and(
      eq(postTranslations.postId, posts.id),
      eq(postTranslations.locale, FEED_LOCALE),
    ))
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt))
    .limit(50)

  const items = rows.map((r) => {
    const url = `${BASE}/${FEED_LOCALE}/news/${r.slug}`
    const desc = r.excerpt ?? r.seoDesc ?? ''
    const pubDate = (r.publishedAt ?? r.updatedAt).toUTCString()
    return `
    <item>
      <title>${escapeXml(r.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(desc)}</description>
      ${r.featuredImage ? `<enclosure url="${escapeXml(r.featuredImage)}" type="image/jpeg" />` : ''}
    </item>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>TeguNews</title>
    <link>${BASE}/${FEED_LOCALE}</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>News, fast — and worth reading</description>
    <language>${FEED_LOCALE}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    },
  })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
