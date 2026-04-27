/**
 * Comment moderation queue.
 *
 * Editors see pending comments first; the tab strip lets them switch to
 * approved/spam/rejected views to audit recent decisions or recover something
 * mis-classified as spam.
 */
import { count, desc, eq } from 'drizzle-orm'
import { comments, posts, postTranslations } from '@teguns/db'
import { getDb } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { CommentRow } from '@/components/comment-row'

type Status = 'pending' | 'approved' | 'spam' | 'rejected'
const STATUSES: Status[] = ['pending', 'approved', 'spam', 'rejected']

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function CommentsQueuePage({ searchParams }: Props) {
  const sp = await searchParams
  const status: Status = (STATUSES as string[]).includes(sp.status ?? '')
    ? (sp.status as Status)
    : 'pending'
  const db = await getDb()

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
      postTitle: postTranslations.title,
      postSlug: postTranslations.slug,
    })
    .from(comments)
    .leftJoin(posts, eq(posts.id, comments.postId))
    .leftJoin(
      postTranslations,
      eq(postTranslations.postId, comments.postId),
    )
    .where(eq(comments.status, status))
    .orderBy(desc(comments.createdAt))
    .limit(100)

  // Per-tab counts so editors see queue depth without switching tabs.
  const counts: Record<Status, number> = { pending: 0, approved: 0, spam: 0, rejected: 0 }
  for (const s of STATUSES) {
    const [r] = await db.select({ c: count() }).from(comments).where(eq(comments.status, s))
    counts[s] = r?.c ?? 0
  }

  return (
    <>
      <PageHeader
        title="Comments"
        description="Moderate reader comments. Approving sends them live; spam/reject hide them but retain the row for audit."
      />

      <nav className="mb-6 flex gap-2 border-b border-zinc-200 text-sm">
        {STATUSES.map((s) => {
          const isActive = s === status
          return (
            <a
              key={s}
              href={`/comments?status=${s}`}
              className={`-mb-px border-b-2 px-3 py-2 capitalize transition-colors ${
                isActive
                  ? 'border-zinc-900 font-semibold text-zinc-900'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {s}
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs">{counts[s]}</span>
            </a>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-muted-foreground">
          No comments in this state.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </ul>
      )}
    </>
  )
}
