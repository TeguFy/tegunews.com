/**
 * Article corrections — append-only audit trail of edits readers should see.
 *
 * Mounted at /api/admin/posts/{id}/corrections.
 *
 * Append-only: there is no PATCH or DELETE. If a correction itself is wrong,
 * append a new one that supersedes it ("Correction (April 28): yesterday's
 * correction misstated...").
 *
 * Issuing a correction optionally re-pushes the article (sets `repushedAt`
 * + bumps `posts.updatedAt`) so the NewsArticle JSON-LD `dateModified`
 * advances and Google News re-fetches.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, asc, eq } from 'drizzle-orm'
import { postCorrections, posts } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole, requireScope } from '../middleware/rbac'
import { audit } from '../audit'
import type { ApiEnv } from '../app'

export const correctionsRouter = new OpenAPIHono<ApiEnv>()
correctionsRouter.use('*', authMiddleware)

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]

const CorrectionSchema = z.object({
  id: z.uuid(),
  postId: z.string(),
  locale: z.string(),
  note: z.string(),
  issuedBy: z.string().nullable(),
  repushedAt: z.string().nullable(),
  createdAt: z.string(),
}).openapi('Correction')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')

const postIdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

function serialise(c: typeof postCorrections.$inferSelect) {
  return {
    ...c,
    repushedAt: c.repushedAt ? c.repushedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }
}

correctionsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/corrections',
    tags: ['Corrections'],
    summary: 'List corrections for a post (chronological)',
    security,
    request: {
      params: postIdParam,
      query: z.object({ locale: z.string().min(2).max(10).optional() }),
    },
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': { schema: z.object({ items: z.array(CorrectionSchema) }) },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { locale } = c.req.valid('query')
    const where = locale
      ? and(eq(postCorrections.postId, id), eq(postCorrections.locale, locale))
      : eq(postCorrections.postId, id)
    const items = await c.var.db
      .select()
      .from(postCorrections)
      .where(where)
      .orderBy(asc(postCorrections.createdAt))
    return c.json({ items: items.map(serialise) }, 200)
  },
)

const IssueInput = z.object({
  locale: z.string().min(2).max(10),
  note: z.string().min(10).max(1000),
  /**
   * If true, bump `posts.updatedAt` so the NewsArticle JSON-LD `dateModified`
   * advances. Use for material corrections you want re-indexed; skip for
   * minor typo fixes.
   */
  repush: z.boolean().optional(),
}).openapi('IssueCorrectionInput')

correctionsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/corrections',
    tags: ['Corrections'],
    summary: 'Issue a correction (append-only)',
    security,
    middleware: [requireRole(ROLES.EDITOR), requireScope('corrections:write')] as const,
    request: {
      params: postIdParam,
      body: { content: { 'application/json': { schema: IssueInput } } },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: CorrectionSchema } } },
      404: { description: 'Post not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const issuedBy = c.var.userId ?? 'system'

    const [post] = await c.var.db.select({ id: posts.id }).from(posts).where(eq(posts.id, id))
    if (!post) return c.json({ error: 'not_found' }, 404)

    const repushedAt = input.repush ? new Date() : null

    const [row] = await c.var.db
      .insert(postCorrections)
      .values({
        postId: id,
        locale: input.locale,
        note: input.note,
        issuedBy,
        repushedAt,
      })
      .returning()

    if (input.repush) {
      // Bump updatedAt + version so NewsArticle JSON-LD dateModified advances.
      await c.var.db
        .update(posts)
        .set({ updatedAt: new Date() })
        .where(eq(posts.id, id))
    }

    await audit(c, 'correction.issue', id, { locale: input.locale, repush: !!input.repush })
    return c.json(serialise(row!), 201)
  },
)
