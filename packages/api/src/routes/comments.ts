/**
 * Comments — public read + write, plus admin moderation queue.
 *
 * Public routes:
 *   GET    /comments?postId=...           List approved comments for an article
 *   POST   /comments                      Submit a new comment (guest or logged-in)
 *
 * Admin routes (mounted under /api/admin/comments by the host):
 *   GET    /comments/queue?status=pending Moderation queue
 *   POST   /comments/:id/moderate         Approve / spam / reject a comment
 *
 * Threading: comments form a self-referential tree via `parent_id`. Depth is
 * enforced by walking the parent chain on insert (D1 has no recursive CTE
 * fast path). MAX_COMMENT_DEPTH lives in `comment-policy.ts`.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import { comments, posts } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware, optionalAuth } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import {
  classifyComment,
  renderCommentBody,
  sha256Hex,
  MAX_COMMENT_DEPTH,
  MAX_COMMENT_LENGTH,
} from '../comment-policy'
import type { ApiEnv } from '../app'

export const commentsRouter = new OpenAPIHono<ApiEnv>()

// ─── Schemas ────────────────────────────────────────────────────────────────

const CommentSchema = z.object({
  id: z.uuid(),
  postId: z.string(),
  parentId: z.string().nullable(),
  userId: z.string().nullable(),
  authorName: z.string(),
  authorWebsite: z.string().nullable(),
  body: z.string(),
  bodyHtml: z.string(),
  status: z.enum(['pending', 'approved', 'spam', 'rejected']),
  upvotes: z.number(),
  locale: z.string().nullable(),
  createdAt: z.string(),
  // Hash of the email — clients use this for gravatar but never see the
  // raw address.
  authorEmailHash: z.string().nullable(),
}).openapi('Comment')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]

function serialiseForPublic(c: typeof comments.$inferSelect) {
  return {
    id: c.id,
    postId: c.postId,
    parentId: c.parentId,
    userId: c.userId,
    authorName: c.authorName,
    authorWebsite: c.authorWebsite,
    body: c.body,
    bodyHtml: c.bodyHtml,
    status: c.status,
    upvotes: c.upvotes,
    locale: c.locale,
    createdAt: c.createdAt.toISOString(),
    authorEmailHash: c.authorEmailHash,
  }
}

// ─── PUBLIC: List approved comments for an article ─────────────────────────

commentsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Comments'],
    summary: 'List approved comments for a post',
    request: {
      query: z.object({
        postId: z.uuid(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(CommentSchema), total: z.number() }) } } },
    },
  }),
  async (c) => {
    const { postId, limit } = c.req.valid('query')
    const items = await c.var.db
      .select()
      .from(comments)
      .where(and(eq(comments.postId, postId), eq(comments.status, 'approved')))
      .orderBy(asc(comments.createdAt))
      .limit(limit)
    const totalRow = await c.var.db
      .select({ c: count() })
      .from(comments)
      .where(and(eq(comments.postId, postId), eq(comments.status, 'approved')))
    return c.json({ items: items.map(serialiseForPublic), total: totalRow[0]?.c ?? 0 }, 200)
  },
)

// ─── PUBLIC: Submit a comment (anonymous-ok via optionalAuth) ──────────────

const SubmitInput = z.object({
  postId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  body: z.string().min(1).max(MAX_COMMENT_LENGTH),
  locale: z.string().min(2).max(10).optional(),
  // Required for guests; ignored when a session is attached.
  authorName: z.string().min(1).max(80).optional(),
  authorEmail: z.email().optional(),
  authorWebsite: z.url().optional(),
  // Honeypot — a CSS-hidden field. Real users don't see it; bots fill it in.
  // Form field name is intentionally generic to lure bots.
  honeypot: z.string().optional(),
  // Optional CAPTCHA token — verified out-of-band by the host.
  captchaToken: z.string().optional(),
}).openapi('SubmitCommentInput')

const submitRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Comments'],
  summary: 'Submit a comment (guest or authenticated)',
  middleware: [optionalAuth] as const,
  request: { body: { content: { 'application/json': { schema: SubmitInput } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: CommentSchema } } },
    400: { description: 'Validation failed', content: { 'application/json': { schema: ErrorSchema } } },
    403: { description: 'Comments disabled or depth exceeded', content: { 'application/json': { schema: ErrorSchema } } },
    404: { description: 'Post not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

commentsRouter.openapi(submitRoute, async (c) => {
  const input = c.req.valid('json')

  const [post] = await c.var.db.select().from(posts).where(eq(posts.id, input.postId))
  if (!post) return c.json({ error: 'post_not_found' }, 404)
  if (post.status !== 'published') return c.json({ error: 'post_not_published' }, 404)
  if (!post.commentsEnabled) return c.json({ error: 'comments_closed' }, 403)

  const session = c.var.session

  // Resolve identity. Logged-in users override guest fields.
  const authorName = session?.user.name ?? input.authorName
  const authorEmail = session ? null : input.authorEmail ?? null
  if (!authorName) return c.json({ error: 'author_name_required' }, 400)
  if (!session && !authorEmail) return c.json({ error: 'author_email_required' }, 400)

  // Enforce depth.
  let depth = 0
  let parent = input.parentId ?? null
  while (parent) {
    if (++depth >= MAX_COMMENT_DEPTH) return c.json({ error: 'depth_exceeded', max: MAX_COMMENT_DEPTH }, 403)
    const [row] = await c.var.db.select({ parentId: comments.parentId, postId: comments.postId })
      .from(comments)
      .where(eq(comments.id, parent))
    if (!row) return c.json({ error: 'parent_not_found' }, 400)
    if (row.postId !== input.postId) return c.json({ error: 'parent_post_mismatch' }, 400)
    parent = row.parentId
  }

  const { html, linkCount } = renderCommentBody(input.body)

  // Approved-history count (cheap signal — a single COUNT on an indexed col).
  let approvedHistoryCount = 0
  if (session?.user.id) {
    const [r] = await c.var.db
      .select({ c: count() })
      .from(comments)
      .where(and(eq(comments.userId, session.user.id), eq(comments.status, 'approved')))
    approvedHistoryCount = r?.c ?? 0
  }

  const status = classifyComment({
    role: (session?.user.role as never) ?? null,
    approvedHistoryCount,
    bodyLength: input.body.length,
    linkCount,
    spamScore: null,
    hasCaptcha: Boolean(input.captchaToken),
    honeypotFilled: Boolean(input.honeypot && input.honeypot.length > 0),
  })

  const ipHeader =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    null

  const id = crypto.randomUUID()
  const now = new Date()

  const [row] = await c.var.db.insert(comments).values({
    id,
    postId: input.postId,
    parentId: input.parentId ?? null,
    userId: session?.user.id ?? null,
    authorName,
    authorEmailHash: authorEmail ? await sha256Hex(authorEmail.toLowerCase()) : null,
    authorWebsite: input.authorWebsite ?? null,
    authorIpHash: ipHeader ? await sha256Hex(ipHeader) : null,
    userAgent: c.req.header('user-agent') ?? null,
    body: input.body,
    bodyHtml: html,
    status,
    locale: input.locale ?? null,
    createdAt: now,
    updatedAt: now,
  }).returning()

  // If auto-approved, bump the denormalised count on the article.
  if (status === 'approved') {
    await c.var.db
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + 1` })
      .where(eq(posts.id, input.postId))
  }

  return c.json(serialiseForPublic(row!), 201)
})

// ─── ADMIN: Moderation queue ───────────────────────────────────────────────

commentsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/queue',
    tags: ['Moderation'],
    summary: 'List comments awaiting moderation',
    security,
    middleware: [authMiddleware, requireRole(ROLES.EDITOR)] as const,
    request: {
      query: z.object({
        status: z.enum(['pending', 'approved', 'spam', 'rejected']).default('pending'),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(CommentSchema), total: z.number() }) } } },
    },
  }),
  async (c) => {
    const { status, limit, offset } = c.req.valid('query')
    const [items, totalRow] = await Promise.all([
      c.var.db
        .select()
        .from(comments)
        .where(eq(comments.status, status))
        .orderBy(desc(comments.createdAt))
        .limit(limit)
        .offset(offset),
      c.var.db.select({ c: count() }).from(comments).where(eq(comments.status, status)),
    ])
    return c.json({ items: items.map(serialiseForPublic), total: totalRow[0]?.c ?? 0 }, 200)
  },
)

// ─── ADMIN: Moderate a single comment ──────────────────────────────────────

const ModerateInput = z.object({
  action: z.enum(['approve', 'spam', 'reject']),
}).openapi('ModerateCommentInput')

commentsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/moderate',
    tags: ['Moderation'],
    summary: 'Moderate a comment',
    security,
    middleware: [authMiddleware, requireRole(ROLES.EDITOR)] as const,
    request: {
      params: z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) }),
      body: { content: { 'application/json': { schema: ModerateInput } } },
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: CommentSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { action } = c.req.valid('json')
    const moderator = c.var.session?.user.id ?? 'system'

    const [existing] = await c.var.db.select().from(comments).where(eq(comments.id, id))
    if (!existing) return c.json({ error: 'not_found' }, 404)

    const nextStatus =
      action === 'approve' ? 'approved' :
      action === 'spam'    ? 'spam'     :
      'rejected'

    const [updated] = await c.var.db
      .update(comments)
      .set({
        status: nextStatus,
        moderatedBy: moderator,
        moderatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(comments.id, id))
      .returning()

    // Maintain the denormalised commentCount on the article. Approving raises
    // it; un-approving (was 'approved' → spam/rejected) drops it.
    const wasApproved = existing.status === 'approved'
    const isApproved = nextStatus === 'approved'
    if (!wasApproved && isApproved) {
      await c.var.db.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, existing.postId))
    } else if (wasApproved && !isApproved) {
      await c.var.db.update(posts).set({ commentCount: sql`MAX(0, ${posts.commentCount} - 1)` }).where(eq(posts.id, existing.postId))
    }

    return c.json(serialiseForPublic(updated!), 200)
  },
)

// ─── PUBLIC: Upvote a comment ──────────────────────────────────────────────
//
// No auth required. Edge rate-limit (in apps/web/middleware.ts) caps abuse;
// client-side localStorage stops accidental double-taps. Anyone determined
// can still spam upvotes — not security-critical, just social signal.

commentsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/upvote',
    tags: ['Comments'],
    summary: 'Upvote a comment',
    request: {
      params: z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) }),
    },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.object({ id: z.string(), upvotes: z.number() }) } },
      },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const [updated] = await c.var.db
      .update(comments)
      .set({ upvotes: sql`${comments.upvotes} + 1` })
      .where(and(eq(comments.id, id), eq(comments.status, 'approved')))
      .returning({ id: comments.id, upvotes: comments.upvotes })
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated, 200)
  },
)
