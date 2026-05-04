/**
 * Agent conversation routes.
 *
 * Routes:
 *   POST /api/admin/posts/{id}/generate-conversation — kick a run.
 *   GET  /api/admin/posts/{id}/conversation-runs    — history for a post.
 *   POST /api/admin/conversation-runs/{id}/retry    — re-run a failed one.
 *
 * Why mounted under /posts for the trigger:
 *   The trigger is post-shaped — you generate a discussion FOR a post. The
 *   parent path makes the OpenAPI doc and audit log read naturally
 *   (`post.generate_conversation`).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq } from 'drizzle-orm'
import { conversationRuns, posts } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole, requireScope } from '../middleware/rbac'
import { audit } from '../audit'
import { generateConversation, markRunFailed } from '../agent-conversation/generator'
import type { ApiEnv } from '../app'

export const agentConversationsRouter = new OpenAPIHono<ApiEnv>()
agentConversationsRouter.use('*', authMiddleware)

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]
const ErrorSchema = z.object({ error: z.string() }).openapi('Error')

const RunSchema = z.object({
  id: z.string(),
  postId: z.string(),
  locale: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  triggeredBy: z.enum(['auto_publish', 'manual', 'scheduled', 'retry']),
  triggeredByUserId: z.string().nullable(),
  personaIds: z.array(z.string()),
  commentIds: z.array(z.string()),
  depth: z.number(),
  model: z.string().nullable(),
  error: z.string().nullable(),
  retries: z.number(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
}).openapi('ConversationRun')

const GenerateInput = z.object({
  locale: z.string().min(2).max(10).default('en'),
  personaIds: z.array(z.string()).max(10).optional(),
  depth: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  topLevelCount: z.number().int().min(1).max(10).optional(),
  model: z.string().optional(),
  dryRun: z.boolean().optional(),
}).openapi('GenerateConversationInput')

const GenerateResultSchema = z.object({
  runId: z.string(),
  status: z.string(),
  commentIds: z.array(z.string()),
  skipped: z.array(z.object({ stage: z.string(), reason: z.string() })),
  preview: z.array(z.object({
    persona: z.string(),
    body: z.string(),
    replyTo: z.string().optional(),
  })).optional(),
}).openapi('GenerateConversationResult')

function serialise(r: typeof conversationRuns.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }
}

// ─── Generate ──────────────────────────────────────────────────────────────

agentConversationsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/generate-conversation',
    tags: ['Agent Conversations'],
    summary: 'Generate AI persona discussion for a post',
    security,
    middleware: [requireRole(ROLES.EDITOR), requireScope('conversations:write')] as const,
    request: {
      params: z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) }),
      body: { content: { 'application/json': { schema: GenerateInput } } },
    },
    responses: {
      200: { description: 'Generated', content: { 'application/json': { schema: GenerateResultSchema } } },
      404: { description: 'Post not found', content: { 'application/json': { schema: ErrorSchema } } },
      503: { description: 'AI binding unavailable', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')

    if (!c.env.AI) {
      return c.json({ error: 'ai_unavailable' }, 503)
    }

    const [post] = await c.var.db.select().from(posts).where(eq(posts.id, id))
    if (!post) return c.json({ error: 'not_found' }, 404)

    let runId: string | null = null
    try {
      const result = await generateConversation(c.var.db, c.env.AI, {
        postId: id,
        locale: input.locale,
        personaIds: input.personaIds,
        depth: input.depth,
        topLevelCount: input.topLevelCount,
        model: input.model,
        triggeredBy: 'manual',
        triggeredByUserId: c.var.userId,
        dryRun: input.dryRun,
      })
      runId = result.runId
      await audit(c, 'post.generate_conversation', id, {
        runId: result.runId,
        commentCount: result.commentIds.length,
        skipped: result.skipped.length,
        dryRun: input.dryRun ?? false,
      })
      return c.json(result, 200)
    } catch (err) {
      if (runId) await markRunFailed(c.var.db, runId, String(err))
      throw err
    }
  },
)

// ─── List runs for a post ──────────────────────────────────────────────────

agentConversationsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/conversation-runs',
    tags: ['Agent Conversations'],
    summary: 'List conversation runs for a post',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: {
      params: z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) }),
      query: z.object({ locale: z.string().optional() }),
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(RunSchema) }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { locale } = c.req.valid('query')
    const where = locale
      ? and(eq(conversationRuns.postId, id), eq(conversationRuns.locale, locale))
      : eq(conversationRuns.postId, id)
    const rows = await c.var.db.select().from(conversationRuns).where(where).orderBy(desc(conversationRuns.createdAt))
    return c.json({ items: rows.map(serialise) }, 200)
  },
)
