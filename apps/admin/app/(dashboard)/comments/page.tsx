/**
 * Comment moderation queue.
 *
 * Editors see pending comments first; the tab strip lets them switch to
 * approved/spam/rejected views to audit recent decisions or recover something
 * mis-classified as spam.
 */
import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm'
import { comments, posts, postTranslations } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { CommentRow } from '@/components/comment-row'
import {
  SearchInput,
  SelectFilter,
  ActiveFilters,
  Pagination,
  PerPageSelect,
  ResultCount,
  type ActiveFilter,
} from '@/components/data-table'
import Link from 'next/link'

type Status = 'pending' | 'approved' | 'spam' | 'rejected'
const STATUSES: Status[] = ['pending', 'approved', 'spam', 'rejected']
const LOCALES = ['en', 'vi'] as const
const ORIGINS = ['human', 'ai'] as const

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? '' : v ?? ''
}

export default async function CommentsQueuePage({ searchParams }: Props) {
  const sp = await searchParams
  const status: Status = (STATUSES as string[]).includes(readStr(sp.status))
    ? (readStr(sp.status) as Status)
    : 'pending'
  const locale = (LOCALES as readonly string[]).includes(readStr(sp.locale))
    ? readStr(sp.locale)
    : ''
  const origin = (ORIGINS as readonly string[]).includes(readStr(sp.origin))
    ? readStr(sp.origin)
    : ''
  const q = readStr(sp.q).trim()
  const dir: 'asc' | 'desc' = readStr(sp.dir) === 'asc' ? 'asc' : 'desc'
  const perPage = Math.min(Math.max(Number.parseInt(readStr(sp.perPage) || '20', 10) || 20, 10), 100)
  const page = Math.max(Number.parseInt(readStr(sp.page) || '1', 10) || 1, 1)

  const db = await getDb()

  const conds = [eq(comments.status, status)]
  if (locale) conds.push(eq(comments.locale, locale))
  if (origin === 'ai') conds.push(eq(comments.isAiGenerated, true))
  if (origin === 'human') conds.push(eq(comments.isAiGenerated, false))
  if (q) {
    const needle = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const orExpr = or(like(comments.authorName, needle), like(comments.body, needle))
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>)
  }
  const whereExpr = and(...conds)

  const orderExpr = dir === 'asc' ? asc(comments.createdAt) : desc(comments.createdAt)

  const rows = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      parentId: comments.parentId,
      authorName: comments.authorName,
      authorWebsite: comments.authorWebsite,
      authorEmailHash: comments.authorEmailHash,
      body: comments.body,
      bodyHtml: comments.bodyHtml,
      status: comments.status,
      createdAt: comments.createdAt,
      locale: comments.locale,
      isAiGenerated: comments.isAiGenerated,
      postTitle: postTranslations.title,
      postSlug: postTranslations.slug,
    })
    .from(comments)
    .leftJoin(posts, eq(posts.id, comments.postId))
    .leftJoin(postTranslations, eq(postTranslations.postId, comments.postId))
    .where(whereExpr)
    .orderBy(orderExpr)
    .limit(perPage)
    .offset((page - 1) * perPage)

  const [totalRow] = await db
    .select({ c: sql<number>`COUNT(DISTINCT ${comments.id})` })
    .from(comments)
    .where(whereExpr)
  const total = totalRow?.c ?? 0

  // Per-tab counts (status only, ignoring other filters — pure queue depth).
  const tabCounts: Record<Status, number> = { pending: 0, approved: 0, spam: 0, rejected: 0 }
  for (const s of STATUSES) {
    const [r] = await db.select({ c: count() }).from(comments).where(eq(comments.status, s))
    tabCounts[s] = r?.c ?? 0
  }

  const active: ActiveFilter[] = []
  if (locale) active.push({ label: `Locale: ${locale}`, paramKeys: ['locale'] })
  if (origin) active.push({ label: `Origin: ${origin === 'ai' ? '🤖 AI' : 'human'}`, paramKeys: ['origin'] })
  if (q) active.push({ label: `Search: "${q}"`, paramKeys: ['q'] })

  return (
    <>
      <PageHeader
        title="Comments"
        description="Moderate reader comments. Approving sends them live; spam/reject hide them but retain the row for audit."
      />

      <nav className="mb-4 flex gap-2 border-b border-zinc-200 text-sm">
        {STATUSES.map((s) => {
          const isActive = s === status
          const params = new URLSearchParams()
          for (const [k, v] of Object.entries(sp)) {
            if (k === 'status' || k === 'page') continue
            const val = readStr(v)
            if (val) params.set(k, val)
          }
          params.set('status', s)
          return (
            <Link
              key={s}
              href={`/comments?${params.toString()}`}
              className={`-mb-px border-b-2 px-3 py-2 capitalize transition-colors ${
                isActive
                  ? 'border-zinc-900 font-semibold text-zinc-900'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {s}
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs">{tabCounts[s]}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search author or body…" className="min-w-[220px] flex-1 sm:flex-none sm:w-72" />
        <SelectFilter
          paramKey="locale"
          label="Locale"
          options={LOCALES.map((l) => ({ value: l, label: l.toUpperCase() }))}
          allLabel="Any locale"
        />
        <SelectFilter
          paramKey="origin"
          label="Origin"
          options={[
            { value: 'human', label: 'Human' },
            { value: 'ai', label: '🤖 AI persona' },
          ]}
          allLabel="Any origin"
        />
        <div className="ml-auto flex items-center gap-3">
          <ResultCount total={total} page={page} perPage={perPage} noun="comment" />
          <PerPageSelect />
        </div>
      </div>

      <ActiveFilters filters={active} clearKeys={['locale', 'origin', 'q']} />

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-muted-foreground">
          {active.length > 0 ? 'No comments match these filters.' : 'No comments in this state.'}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </ul>
          <Pagination page={page} perPage={perPage} total={total} searchParams={sp} />
        </>
      )}
    </>
  )
}
