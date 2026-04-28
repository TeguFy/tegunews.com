/**
 * View tracker — bumps `posts.viewCount` for the current article.
 *
 * Called fire-and-forget from the article page client. Rate-limit handled
 * by the edge middleware; per-IP repeat hits within the same minute don't
 * incur extra cost because the request itself is throttled, not because
 * we deduplicate here.
 *
 * Body: `{ postId: string }`. Returns 204 on success, 400 on bad input,
 * 404 if the post doesn't exist or isn't published.
 */
import { eq, and } from 'drizzle-orm'
import { posts } from '@teguns/db'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { postId?: string }
  try { body = await req.json() } catch { return new Response('bad_json', { status: 400 }) }
  const postId = body.postId
  if (!postId || typeof postId !== 'string') {
    return new Response('postId_required', { status: 400 })
  }

  const db = await getDb()
  const res = await db
    .update(posts)
    .set({ viewCount: sql`${posts.viewCount} + 1` })
    .where(and(eq(posts.id, postId), eq(posts.status, 'published')))
    .returning({ id: posts.id })

  if (!res[0]) return new Response('not_found', { status: 404 })
  return new Response(null, { status: 204 })
}
