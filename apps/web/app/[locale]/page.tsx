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

      <section className="border-b border-border bg-gradient-to-b from-muted/40 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <h1 className="font-serif text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            {tSite('name')}
          </h1>
          <p className="mt-3 max-w-2xl font-serif text-lg italic text-muted-foreground md:text-xl">
            {tSite('tagline')}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-12">
        {lede && (
          <section className="mb-14">
            <SectionLabel>{tHome('featured')}</SectionLabel>
            <ArticleCard locale={locale} article={lede} variant="lede" />
          </section>
        )}

        {rest.length > 0 && (
          <section>
            <SectionLabel>{tHome('latest')}</SectionLabel>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="kicker text-foreground/70">{children}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}
