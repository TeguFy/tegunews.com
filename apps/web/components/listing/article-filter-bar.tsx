import { getTranslations } from 'next-intl/server'
import type { ListingSort, ListingTimeRange } from '@/lib/posts'
import { FilterDropdown, type FilterDropdownOption } from './filter-dropdown'

interface Props {
  locale: string
  basePath: string
  sort: ListingSort
  timeRange: ListingTimeRange
  total: number
  page: number
  perPage: number
  /** Hide the time-range filter on surfaces where it adds noise. */
  showTime?: boolean
}

export async function ArticleFilterBar({
  locale,
  basePath,
  sort,
  timeRange,
  total,
  page,
  perPage,
  showTime = true,
}: Props) {
  const t = await getTranslations({ locale, namespace: 'listing' })

  const sortOptions: FilterDropdownOption<ListingSort>[] = [
    { value: 'latest', label: t('sortLatest') },
    { value: 'popular', label: t('sortPopular') },
    { value: 'oldest', label: t('sortOldest') },
  ]
  const timeOptions: FilterDropdownOption<ListingTimeRange>[] = [
    { value: 'all', label: t('timeAll') },
    { value: 'week', label: t('timeWeek') },
    { value: 'month', label: t('timeMonth') },
    { value: 'year', label: t('timeYear') },
  ]

  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)

  return (
    <div className="mb-8 flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-baseline md:justify-between">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <FilterDropdown
          label={t('sort')}
          paramKey="sort"
          basePath={basePath}
          defaultValue="latest"
          current={sort}
          options={sortOptions}
        />
        {showTime && (
          <FilterDropdown
            label={t('time')}
            paramKey="time"
            basePath={basePath}
            defaultValue="all"
            current={timeRange}
            options={timeOptions}
          />
        )}
      </div>
      {total > 0 && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {t('showing', { from, to, total })}
        </p>
      )}
    </div>
  )
}
