/**
 * Google News sitemap.
 *
 * Distinct from `/sitemap.xml`. Includes only articles published within the
 * `newsRecencyHours` window (48h by default — Google's News inclusion cutoff).
 * Each entry uses the `<news:news>` namespace.
 */
import { and, desc, eq, gt } from 'drizzle-orm'
import { posts, postTranslations } from '@teguns/db'
import { SEO_LIMITS } from '@teguns/seo'
import { getDb } from '@/lib/db'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'

export const dynamic = 'force-dynamic'
export const revalidate = 600

export async function GET() {
  const db = await getDb()
  const cutoff = new Date(Date.now() - SEO_LIMITS.newsRecencyHours * 3600 * 1000)

  const rows = await db
    .select({
      publishedAt: posts.publishedAt,
      locale: postTranslations.locale,
      slug: postTranslations.slug,
      title: postTranslations.title,
      noIndex: postTranslations.noIndex,
    })
    .from(posts)
    .innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
    .where(and(eq(posts.status, 'published'), gt(posts.publishedAt, cutoff)))
    .orderBy(desc(posts.publishedAt))
    .limit(1000)

  const items = rows
    .filter((r) => !r.noIndex && r.publishedAt)
    .map((r) => `
    <url>
      <loc>${BASE}/${r.locale}/news/${escapeXml(r.slug)}</loc>
      <news:news>
        <news:publication>
          <news:name>TeguNews</news:name>
          <news:language>${r.locale}</news:language>
        </news:publication>
        <news:publication_date>${r.publishedAt!.toISOString()}</news:publication_date>
        <news:title>${escapeXml(r.title)}</news:title>
      </news:news>
    </url>`)
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
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
