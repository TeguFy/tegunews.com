import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchCategoryListing } from '@/lib/posts'
import { ArticleListing } from '@/components/listing/article-listing'
import { parseListingParams, flattenSearchParams } from '@/components/listing/params'

const PER_PAGE = 12

interface Props {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const sp = await searchParams
  const parsed = parseListingParams(sp)

  const result = await fetchCategoryListing(slug, {
    locale,
    page: parsed.page,
    perPage: PER_PAGE,
    sort: parsed.sort,
    timeRange: parsed.timeRange,
  })
  if (!result) return {}

  const baseTitle = result.category.seoTitle ?? result.category.name
  const title = parsed.page > 1 ? `${baseTitle} — Page ${parsed.page}` : baseTitle
  const description = result.category.seoDesc ?? result.category.description ?? undefined

  // Canonical points at the unfiltered, page-1 URL of this category.
  const canonical = `/${locale}/category/${slug}`

  // SEO policy:
  //   - Page 1, default sort, all-time   → indexable + canonical
  //   - Page N (default sort/time)        → indexable + prev/next link tags
  //   - Any non-default sort/time         → noindex,follow (avoid duplicate-content surfaces)
  const isFilteredView = parsed.sort !== 'latest' || parsed.timeRange !== 'all'
  const robots: Metadata['robots'] = isFilteredView
    ? { index: false, follow: true }
    : { index: true, follow: true }

  // Build prev/next link tags for paginated default-view pages.
  const otherLinks: Array<{ rel: string; url: string }> = []
  if (!isFilteredView) {
    if (parsed.page > 1) {
      const prev = parsed.page - 1
      otherLinks.push({
        rel: 'prev',
        url: prev === 1 ? canonical : `${canonical}?page=${prev}`,
      })
    }
    if (parsed.page < result.pageCount) {
      otherLinks.push({ rel: 'next', url: `${canonical}?page=${parsed.page + 1}` })
    }
  }

  return {
    title,
    description,
    alternates: {
      canonical,
      // Surface prev/next as alternates — Next renders them as <link> tags.
      ...(otherLinks.length > 0 && {
        types: Object.fromEntries(otherLinks.map((l) => [l.rel, l.url])),
      }),
    },
    robots,
    other: otherLinks.reduce<Record<string, string>>((acc, l) => {
      acc[`link:${l.rel}`] = l.url
      return acc
    }, {}),
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params
  const sp = await searchParams
  const parsed = parseListingParams(sp)

  const result = await fetchCategoryListing(slug, {
    locale,
    page: parsed.page,
    perPage: PER_PAGE,
    sort: parsed.sort,
    timeRange: parsed.timeRange,
  })
  if (!result) notFound()

  // Out-of-range page → 404 (don't show a phantom empty page that could be indexed).
  if (parsed.page > result.pageCount && result.total > 0) notFound()

  const basePath = `/${locale}/category/${slug}`

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-10 border-b border-border pb-8">
        <p className="kicker text-primary">Category</p>
        <h1 className="mt-2 font-serif text-4xl font-extrabold tracking-tight md:text-5xl">
          {result.category.name}
        </h1>
        {result.category.description && (
          <p className="mt-3 max-w-2xl font-serif text-lg italic text-muted-foreground">
            {result.category.description}
          </p>
        )}
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
