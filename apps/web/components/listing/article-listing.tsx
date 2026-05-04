import { ArticleCard, type ArticleCardData } from '@/components/article-card'
import { ArticleFilterBar } from './article-filter-bar'
import { ArticlePagination } from './article-pagination'
import { EmptyState } from './empty-state'
import type { ListingSort, ListingTimeRange } from '@/lib/posts'

interface Props {
  locale: string
  basePath: string
  articles: ArticleCardData[]
  page: number
  perPage: number
  pageCount: number
  total: number
  sort: ListingSort
  timeRange: ListingTimeRange
  /** Other search params to preserve in pagination links. */
  searchParams: Record<string, string | undefined>
  showTimeFilter?: boolean
}

export function ArticleListing({
  locale,
  basePath,
  articles,
  page,
  perPage,
  pageCount,
  total,
  sort,
  timeRange,
  searchParams,
  showTimeFilter = true,
}: Props) {
  return (
    <>
      <ArticleFilterBar
        locale={locale}
        basePath={basePath}
        sort={sort}
        timeRange={timeRange}
        total={total}
        page={page}
        perPage={perPage}
        showTime={showTimeFilter}
      />

      {articles.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {articles.map((p) => (
              <ArticleCard key={p.id} locale={locale} article={p} />
            ))}
          </div>
          <ArticlePagination
            locale={locale}
            basePath={basePath}
            searchParams={searchParams}
            page={page}
            pageCount={pageCount}
          />
        </>
      )}
    </>
  )
}
