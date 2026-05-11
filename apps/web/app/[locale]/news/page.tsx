import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { generateBreadcrumbSchema } from '@teguns/seo'
import { JsonLd } from '@/components/json-ld'
import { ArticleListing } from '@/components/listing/article-listing'
import { parseListingParams, flattenSearchParams } from '@/components/listing/params'
import { fetchAllListing } from '@/lib/posts'
import { routing } from '@/i18n/routing'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
const PER_PAGE = 12

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const sp = await searchParams
  const parsed = parseListingParams(sp)
  const t = await getTranslations({ locale, namespace: 'seo' })

  const baseTitle = t('newsListTitle')
  const title = parsed.page > 1 ? `${baseTitle} — Page ${parsed.page}` : baseTitle
  const description = t('newsListDescription')
  const canonical = `/${locale}/news`

  const isFilteredView = parsed.sort !== 'latest' || parsed.timeRange !== 'all'
  const robots: Metadata['robots'] = isFilteredView
    ? { index: false, follow: true }
    : { index: true, follow: true }

  const languages: Record<string, string> = {}
  for (const l of routing.locales) languages[l] = `${BASE_URL}/${l}/news`
  languages['x-default'] = `${BASE_URL}/en/news`

  return {
    title,
    description,
    alternates: { canonical, languages },
    robots,
    openGraph: {
      type: 'website',
      url: `${BASE_URL}${canonical}`,
      title: baseTitle,
      description,
      siteName: 'TeguNews',
      locale,
    },
  }
}

export default async function NewsListingPage({ params, searchParams }: Props) {
  const { locale } = await params
  const sp = await searchParams
  const parsed = parseListingParams(sp)

  const result = await fetchAllListing({
    locale,
    page: parsed.page,
    perPage: PER_PAGE,
    sort: parsed.sort,
    timeRange: parsed.timeRange,
  })

  if (parsed.page > result.pageCount && result.total > 0) notFound()

  const t = await getTranslations({ locale, namespace: 'seo' })
  const tSite = await getTranslations({ locale, namespace: 'site' })
  const basePath = `/${locale}/news`

  const breadcrumb = generateBreadcrumbSchema([
    { name: tSite('name'), url: `${BASE_URL}/${locale}` },
    { name: t('newsListTitle'), url: `${BASE_URL}${basePath}` },
  ])

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <JsonLd data={breadcrumb} />

      <header className="mb-10 border-b border-border pb-8">
        <p className="kicker text-primary">News</p>
        <h1 className="mt-2 font-serif text-4xl font-extrabold tracking-tight md:text-5xl">
          {t('newsListTitle')}
        </h1>
        <p className="mt-3 max-w-2xl font-serif text-lg italic text-muted-foreground">
          {t('newsListDescription')}
        </p>
      </header>

      <ArticleListing
        locale={locale}
        basePath={basePath}
        articles={result.rows}
        page={result.page}
        perPage={result.perPage}
        pageCount={result.pageCount}
        total={result.total}
        sort={parsed.sort}
        timeRange={parsed.timeRange}
        searchParams={flattenSearchParams(sp)}
      />
    </main>
  )
}
