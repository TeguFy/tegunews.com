import Link from 'next/link'
import { desc, eq, count } from 'drizzle-orm'
import { posts, postTranslations } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ status?: string }>
}

const STATUSES = ['all', 'draft', 'published', 'scheduled'] as const
type StatusFilter = (typeof STATUSES)[number]

export default async function PostsPage({ searchParams }: Props) {
  const sp = await searchParams
  const status: StatusFilter = (STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as StatusFilter)
    : 'all'
  const db = await getDb()

  // Single query: all posts + their first English translation (for the title
  // column). LEFT JOIN means a post with no English translation still shows up
  // — important for VI-only content.
  const where = status === 'all' ? undefined : eq(posts.status, status)
  const rows = await db
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
    .leftJoin(postTranslations, eq(postTranslations.postId, posts.id))
    .where(where)
    .orderBy(desc(posts.updatedAt))
    .limit(100)

  // Per-status counts so the tab strip shows queue depth.
  const counts: Record<StatusFilter, number> = { all: 0, draft: 0, published: 0, scheduled: 0 }
  const [total] = await db.select({ c: count() }).from(posts)
  counts.all = total?.c ?? 0
  for (const s of ['draft', 'published', 'scheduled'] as const) {
    const [r] = await db.select({ c: count() }).from(posts).where(eq(posts.status, s))
    counts[s] = r?.c ?? 0
  }

  return (
    <>
      <PageHeader
        title="Articles"
        description={`${counts.all} total — ${counts.published} published, ${counts.draft} draft, ${counts.scheduled} scheduled.`}
      />

      <nav className="mb-6 flex gap-2 border-b border-zinc-200 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/posts' : `/posts?status=${s}`}
            className={`-mb-px border-b-2 px-3 py-2 capitalize transition-colors ${
              s === status
                ? 'border-zinc-900 font-semibold text-zinc-900'
                : 'border-transparent text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {s}
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
          No articles yet. Use the SDK or wire-importer to create one:
          <pre className="mt-3 inline-block rounded bg-zinc-50 px-3 py-2 text-xs text-left">
{`PUT /api/admin/posts/by-slug/en/<slug>
{ "title": "...", "content": "<p>...</p>", ... }`}
          </pre>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Locale</th>
                <th className="px-4 py-2.5 text-right">Views</th>
                <th className="px-4 py-2.5 text-right">Comments</th>
                <th className="px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => {
                const isBreaking = r.breakingUntil ? r.breakingUntil > new Date() : false
                return (
                  <tr key={`${r.id}-${r.locale ?? 'none'}`} className="hover:bg-zinc-50">
                    <td className="max-w-md truncate px-4 py-2.5">
                      <span className="font-medium text-zinc-900">{r.title ?? <em className="text-zinc-400">untitled</em>}</span>
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
      )}
    </>
  )
}
