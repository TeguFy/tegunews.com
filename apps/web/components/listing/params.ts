import type { ListingSort, ListingTimeRange } from '@/lib/posts'

const VALID_SORTS: ListingSort[] = ['latest', 'popular', 'oldest']
const VALID_TIMES: ListingTimeRange[] = ['all', 'week', 'month', 'year']

export interface ParsedListingParams {
  page: number
  sort: ListingSort
  timeRange: ListingTimeRange
  /** True when current params equal the canonical default — page 1, latest, all-time. */
  isCanonical: boolean
}

export function parseListingParams(
  searchParams: Record<string, string | string[] | undefined>,
): ParsedListingParams {
  const pageRaw = pickString(searchParams.page)
  const sortRaw = pickString(searchParams.sort)
  const timeRaw = pickString(searchParams.time)

  const pageNum = pageRaw ? parseInt(pageRaw, 10) : 1
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1
  const sort = (VALID_SORTS as string[]).includes(sortRaw ?? '')
    ? (sortRaw as ListingSort)
    : 'latest'
  const timeRange = (VALID_TIMES as string[]).includes(timeRaw ?? '')
    ? (timeRaw as ListingTimeRange)
    : 'all'

  const isCanonical = page === 1 && sort === 'latest' && timeRange === 'all'
  return { page, sort, timeRange, isCanonical }
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

/**
 * Strip undefined/empty values to a clean Record<string, string> for
 * pagination/filter components.
 */
export function flattenSearchParams(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) out[k] = v[0]
    else out[k] = v
  }
  return out
}
