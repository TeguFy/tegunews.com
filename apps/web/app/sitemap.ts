import type { MetadataRoute } from 'next'
import { eq } from 'drizzle-orm'
import { posts, postTranslations, categories } from '@teguns/db'
import { getDb } from '@/lib/db'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
const LOCALES = ['en', 'vi'] as const

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb()
  const entries: MetadataRoute.Sitemap = []

  for (const locale of LOCALES) {
    entries.push(
      { url: `${BASE}/${locale}`, changeFrequency: 'hourly', priority: 1.0 },
      { url: `${BASE}/${locale}/news`, changeFrequency: 'hourly', priority: 0.9 },
    )
  }

  const rows = await db
    .select({
      id: posts.id,
      updatedAt: posts.updatedAt,
      publishedAt: posts.publishedAt,
      locale: postTranslations.locale,
      slug: postTranslations.slug,
      noIndex: postTranslations.noIndex,
    })
    .from(posts)
    .innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
    .where(eq(posts.status, 'published'))

  for (const row of rows) {
    if (row.noIndex) continue
    entries.push({
      url: `${BASE}/${row.locale}/news/${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: 'hourly',
      priority: 0.7,
    })
  }

  const cats = await db.select().from(categories)
  for (const cat of cats) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${BASE}/${locale}/category/${cat.slug}`,
        changeFrequency: 'daily',
        priority: 0.5,
      })
    }
  }

  return entries
}
