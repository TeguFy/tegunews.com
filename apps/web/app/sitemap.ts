import type { MetadataRoute } from 'next'
import { eq } from 'drizzle-orm'
import { posts, postTranslations, categories } from '@teguns/db'
import { getDb } from '@/lib/db'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
const LOCALES = ['en', 'vi'] as const
const DEFAULT_LOCALE = 'en'
type Locale = (typeof LOCALES)[number]

export const dynamic = 'force-dynamic'

/**
 * Sitemap entries include per-URL hreflang alternates in `alternates.languages`.
 * Next.js emits these as `<xhtml:link rel="alternate" hreflang="…">` children
 * inside each `<url>` — required for Google to understand multilingual
 * content as the same canonical page in different locales.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb()
  const entries: MetadataRoute.Sitemap = []

  const localeAlternates = (path: (l: Locale) => string): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const l of LOCALES) out[l] = `${BASE}${path(l)}`
    out['x-default'] = `${BASE}${path(DEFAULT_LOCALE)}`
    return out
  }

  // Home + /news listing per locale, each with alternates.
  for (const locale of LOCALES) {
    entries.push({
      url: `${BASE}/${locale}`,
      changeFrequency: 'hourly',
      priority: 1.0,
      alternates: { languages: localeAlternates((l) => `/${l}`) },
    })
    entries.push({
      url: `${BASE}/${locale}/news`,
      changeFrequency: 'hourly',
      priority: 0.9,
      alternates: { languages: localeAlternates((l) => `/${l}/news`) },
    })
  }

  // Articles: group rows by postId so each entry can reference its sibling-locale slugs.
  const rows = await db
    .select({
      postId: posts.id,
      updatedAt: posts.updatedAt,
      publishedAt: posts.publishedAt,
      locale: postTranslations.locale,
      slug: postTranslations.slug,
      noIndex: postTranslations.noIndex,
    })
    .from(posts)
    .innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
    .where(eq(posts.status, 'published'))

  const byPost = new Map<string, typeof rows>()
  for (const row of rows) {
    const arr = byPost.get(row.postId) ?? []
    arr.push(row)
    byPost.set(row.postId, arr)
  }

  for (const translations of byPost.values()) {
    const slugByLocale = new Map<string, string>()
    for (const t of translations) slugByLocale.set(t.locale, t.slug)

    for (const t of translations) {
      if (t.noIndex) continue
      const alternates: Record<string, string> = {}
      for (const l of LOCALES) {
        const s = slugByLocale.get(l)
        if (s) alternates[l] = `${BASE}/${l}/news/${s}`
      }
      const defaultSlug = slugByLocale.get(DEFAULT_LOCALE) ?? t.slug
      alternates['x-default'] = `${BASE}/${DEFAULT_LOCALE}/news/${defaultSlug}`

      entries.push({
        url: `${BASE}/${t.locale}/news/${t.slug}`,
        lastModified: t.updatedAt,
        changeFrequency: 'hourly',
        priority: 0.7,
        alternates: { languages: alternates },
      })
    }
  }

  // Categories share the same slug across locales (slug lives on the category row).
  const cats = await db.select().from(categories)
  for (const cat of cats) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${BASE}/${locale}/category/${cat.slug}`,
        changeFrequency: 'daily',
        priority: 0.5,
        alternates: { languages: localeAlternates((l) => `/${l}/category/${cat.slug}`) },
      })
    }
  }

  return entries
}
