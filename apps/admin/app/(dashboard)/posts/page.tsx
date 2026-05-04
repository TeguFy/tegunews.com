import Link from 'next/link'
import { and, asc, desc, eq, like, or, sql, count } from 'drizzle-orm'
import { posts, postTranslations, categories } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import {
  SearchInput,
  SelectFilter,
  ActiveFilters,
  Pagination,
  PerPageSelect,
  ResultCount,
  SortableHeader,
  type ActiveFilter,
} from '@/components/data-table'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const STATUSES = ['draft', 'published', 'scheduled'] as const
type Status = (typeof STATUSES)[number]
const LOCALES = ['en', 'vi'] as const
const SORT_KEYS = ['updatedAt', 'publishedAt', 'viewCount', 'commentCount', 'title'] as const
type SortKey = (typeof SORT_KEYS)[number]

function pickStr<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}
function readStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? ''
}

export default async function PostsPage({ searchParams }: Props) {
  const sp = await searchParams
  const status = pickStr(sp.status, STATUSES)
  const locale = pickStr(sp.locale, LOCALES)
  const categoryId = readStr(sp.categoryId) || undefined
  const q = readStr(sp.q).trim()
  const sort: SortKey = pickStr(sp.sort, SORT_KEYS) ?? 'updatedAt'
  const dir: 'asc' | 'desc' = readStr(sp.dir) === 'asc' ? 'asc' : 'desc'
  const perPage = Math.min(Math.max(Number.parseInt(readStr(sp.perPage) || '20', 10) || 20, 10), 100)
  const page = Math.max(Number.parseInt(readStr(sp.page) || '1', 10) || 1, 1)

  const db = await getDb()

  // Filter for the JOINED row (posts × translations). Translation filters
  // (locale, q, sortable title) require the join even when not all posts have
  // translations — we use INNER JOIN when those filters are set.
  const requiresTranslation = Boolean(locale) || Boolean(q) || sort === 'title'

  const conds = [] as Array<ReturnType<typeof eq>>
  if (status) conds.push(eq(posts.status, status))
  if (categoryId) conds.push(eq(posts.categoryId, categoryId))
  if (locale) conds.push(eq(postTranslations.locale, locale))
  if (q) {
    const needle = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const orExpr = or(
      like(postTranslations.title, needle),
      like(postTranslations.slug, needle),
    )
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>)
  }
  const whereExpr = conds.length ? and(...conds) : undefined

  const sortCol =
    sort === 'updatedAt' ? posts.updatedAt
      : sort === 'publishedAt' ? posts.publishedAt
      : sort === 'viewCount' ? posts.viewCount
      : sort === 'commentCount' ? posts.commentCount
      : postTranslations.title
  const orderExpr = dir === 'asc' ? asc(sortCol) : desc(sortCol)

  const baseSelect = db
    .select({
      id: posts.id,
      status: posts.status,
      featured: posts.featured,
      breakingUntil: posts.breakingUntil,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      authorName: posts.authorName,
      viewCount: posts.viewCount,
      commentCount: posts.commentCount,
      title: postTranslations.title,
      slug: postTranslations.slug,
      locale: postTranslations.locale,
    })
    .from(posts)

  const joined = requiresTranslation
    ? baseSelect.innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
    : baseSelect.leftJoin(postTranslations, eq(postTranslations.postId, posts.id))

  const rowsQuery = whereExpr ? joined.where(whereExpr) : joined
  const rows = await rowsQuery.orderBy(orderExpr).limit(perPage).offset((page - 1) * perPage)

  // Total count with the same filters. We count distinct posts when joined to
  // avoid duplicates from posts having multiple translations.
  const countBase = db
    .select({ c: sql<number>`COUNT(DISTINCT ${posts.id})` })
    .from(posts)
  const countJoined = requiresTranslation || locale || q
    ? countBase.innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
    : countBase.leftJoin(postTranslations, eq(postTranslations.postId, posts.id))
  const [totalRow] = whereExpr ? await countJoined.where(whereExpr) : await countJoined
  const total = totalRow?.c ?? 0

  // Per-status tab counts (independent of other filters — keep simple).
  const statusCounts: Record<'all' | Status, number> = { all: 0, draft: 0, published: 0, scheduled: 0 }
  const [allRow] = await db.select({ c: count() }).from(posts)
  statusCounts.all = allRow?.c ?? 0
  for (const s of STATUSES) {
    const [r] = await db.select({ c: count() }).from(posts).where(eq(posts.status, s))
    statusCounts[s] = r?.c ?? 0
  }

  // Categories for the filter dropdown.
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name))
  const categoryOptions = cats.map((c) => ({ value: c.id, label: c.name }))
  const categoryById = new Map(cats.map((c) => [c.id, c.name]))

  // Active-filter chips.
  const active: ActiveFilter[] = []
  if (status) active.push({ label: `Status: ${status}`, paramKeys: ['status'] })
  if (locale) active.push({ label: `Locale: ${locale}`, paramKeys: ['locale'] })
  if (categoryId) active.push({ label: `Category: ${categoryById.get(categoryId) ?? categoryId}`, paramKeys: ['categoryId'] })
  if (q) active.push({ label: `Search: "${q}"`, paramKeys: ['q'] })

  return (
    <>
      <PageHeader
        title="Articles"
        description={`${statusCounts.all} total — ${statusCounts.published} published, ${statusCounts.draft} draft, ${statusCounts.scheduled} scheduled.`}
        actions={
          <Link
            href="/posts/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            + New article
          </Link>
        }
      />

      {/* Status tabs (kept for queue-depth glance) */}
      <nav className="mb-4 flex gap-2 border-b border-zinc-200 text-sm">
        {(['all', ...STATUSES] as const).map((s) => {
          const isActive = (s === 'all' && !status) || s === status
          const params = new URLSearchParams()
          for (const [k, v] of Object.entries(sp)) {
            if (k === 'status' || k === 'page') continue
            const val = readStr(v)
            if (val) params.set(k, val)
          }
          if (s !== 'all') params.set('status', s)
          const qs = params.toString()
          return (
            <Link
              key={s}
              href={qs ? `/posts?${qs}` : '/posts'}
              className={`-mb-px border-b-2 px-3 py-2 capitalize transition-colors ${
                isActive
                  ? 'border-zinc-900 font-semibold text-zinc-900'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {s}
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs">{statusCounts[s]}</span>
            </Link>
          )
        })}
      </nav>

      {/* Filter toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search title or slug…" className="min-w-[220px] flex-1 sm:flex-none sm:w-72" />
        <SelectFilter
          paramKey="locale"
          label="Locale"
          options={LOCALES.map((l) => ({ value: l, label: l.toUpperCase() }))}
          allLabel="Any locale"
        />
        <SelectFilter
          paramKey="categoryId"
          label="Category"
          options={categoryOptions}
          allLabel="Any category"
        />
        <div className="ml-auto flex items-center gap-3">
          <ResultCount total={total} page={page} perPage={perPage} noun="article" />
          <PerPageSelect />
        </div>
      </div>

      <ActiveFilters filters={active} clearKeys={['status', 'locale', 'categoryId', 'q']} />

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
          {active.length > 0
            ? 'No articles match these filters.'
            : 'No articles yet. Use the SDK or wire-importer to create one.'}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-600">
                <tr>
                  <SortableHeader
                    sortKey="title"
                    label="Title"
                    activeKey={sort}
                    activeDir={dir}
                    defaultDir="asc"
                    searchParams={sp}
                  />
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Locale</th>
                  <SortableHeader
                    sortKey="viewCount"
                    label="Views"
                    activeKey={sort}
                    activeDir={dir}
                    searchParams={sp}
                    align="right"
                  />
                  <SortableHeader
                    sortKey="commentCount"
                    label="Comments"
                    activeKey={sort}
                    activeDir={dir}
                    searchParams={sp}
                    align="right"
                  />
                  <SortableHeader
                    sortKey="updatedAt"
                    label="Updated"
                    activeKey={sort}
                    activeDir={dir}
                    searchParams={sp}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => {
                  const isBreaking = r.breakingUntil ? r.breakingUntil > new Date() : false
                  return (
                    <tr key={`${r.id}-${r.locale ?? 'none'}`} className="hover:bg-zinc-50">
                      <td className="max-w-md truncate px-4 py-2.5">
                        <Link
                          href={`/posts/${r.id}/edit${r.locale ? `?locale=${r.locale}` : ''}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {r.title ?? <em className="text-zinc-400">untitled</em>}
                        </Link>
                        {r.featured && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Featured</span>}
                        {isBreaking && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-800">Breaking</span>}
                        {r.slug && <p className="truncate font-mono text-xs text-zinc-500">/{r.locale}/news/{r.slug}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === 'published' ? 'bg-emerald-100 text-emerald-800' :
                          r.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                          'bg-zinc-100 text-zinc-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-600">{r.locale ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{r.viewCount.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{r.commentCount}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">
                        {r.updatedAt.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} perPage={perPage} total={total} searchParams={sp} />
        </>
      )}
    </>
  )
}
