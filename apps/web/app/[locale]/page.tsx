import { getTranslations } from 'next-intl/server'
import { JsonLd } from '@/components/json-ld'
import { ArticleCard } from '@/components/article-card'
import { generateWebsiteSchema, generateOrganizationSchema } from '@teguns/seo'
import { fetchRecentArticles } from '@/lib/posts'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'

interface Props {
  params: Promise<{ locale: string }>
}

// News home revalidates aggressively — fresh stories should propagate quickly.
// 5 min is the sweet spot between cache hit rate and freshness for a news lede.
export const revalidate = 300

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  const tHome = await getTranslations({ locale, namespace: 'home' })
  const tSite = await getTranslations({ locale, namespace: 'site' })
  const recent = await fetchRecentArticles(locale, { limit: 13 })

  const lede = recent.find((p) => p.featured) ?? recent[0]
  const rest = recent.filter((p) => p.id !== lede?.id)

  return (
    <>
      <JsonLd data={[generateWebsiteSchema(BASE_URL), generateOrganizationSchema(BASE_URL)]} />

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{tSite('name')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{tSite('tagline')}</p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {lede && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tHome('featured')}
            </h2>
            <ArticleCard locale={locale} article={lede} variant="lede" />
          </section>
        )}

        {rest.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tHome('latest')}
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <ArticleCard key={p.id} locale={locale} article={p} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
