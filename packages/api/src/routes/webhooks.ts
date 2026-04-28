/**
 * Webhook subscription management. Mounted at /api/admin/webhooks.
 *
 * Create returns the secret in plaintext ONCE. Subsequent reads omit it
 * (only the row's other fields). Lost a secret = delete and recreate; we
 * intentionally don't have a "rotate" endpoint because rotating without
 * replay-protection invites confusion about which signature is valid.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'
import { webhookSubscriptions } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole, requireScope } from '../middleware/rbac'
import { audit } from '../audit'
import type { ApiEnv } from '../app'

export const webhooksRouter = new OpenAPIHono<ApiEnv>()
webhooksRouter.use('*', authMiddleware)

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]

const KNOWN_EVENTS = ['post.publish', 'post.unpublish', 'post.update', 'comment.approve', 'correction.issue'] as const

const Subscription = z.object({
  id: z.uuid(),
  url: z.string(),
  events: z.array(z.string()),
  description: z.string().nullable(),
  active: z.boolean(),
  lastDeliveryAt: z.string().nullable(),
  lastFailureStatus: z.number().nullable(),
  createdAt: z.string(),
}).openapi('WebhookSubscription')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')

function serialise(s: typeof webhookSubscriptions.$inferSelect) {
  // Never echo the secret — only the create response includes it.
  return {
    id: s.id,
    url: s.url,
    events: s.events,
    description: s.description,
    active: s.active,
    lastDeliveryAt: s.lastDeliveryAt ? s.lastDeliveryAt.toISOString() : null,
    lastFailureStatus: s.lastFailureStatus,
    createdAt: s.createdAt.toISOString(),
  }
}

webhooksRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Webhooks'],
    summary: 'List webhook subscriptions',
    security,
    middleware: [requireRole(ROLES.ADMIN)] as const,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(Subscription) }) } } },
    },
  }),
  async (c) => {
    const items = await c.var.db.select().from(webhookSubscriptions).orderBy(desc(webhookSubscriptions.createdAt))
    return c.json({ items: items.map(serialise) }, 200)
  },
)

const CreateInput = z.object({
  url: z.url(),
  events: z.array(z.enum(KNOWN_EVENTS)).min(1),
  description: z.string().max(200).optional(),
}).openapi('CreateWebhookInput')

webhooksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Webhooks'],
    summary: 'Register a webhook (returns secret once)',
    description:
      'The response body contains the HMAC secret in plaintext. Capture it — it is not retrievable later. Receivers verify each delivery by recomputing HMAC-SHA256 of the body using the secret and comparing to the `X-Tegunews-Signature: sha256=<hex>` header.',
    security,
    middleware: [requireRole(ROLES.ADMIN), requireScope('webhooks:write')] as const,
    request: { body: { content: { 'application/json': { schema: CreateInput } } } },
    responses: {
      201: {
        description: 'Created',
        content: {
          'application/json': {
            schema: Subscription.extend({ secret: z.string().openapi({ description: 'Returned ONCE — not retrievable later.' }) }),
          },
        },
      },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    const id = crypto.randomUUID()
    const secret = generateSecret()
    const [row] = await c.var.db
      .insert(webhookSubscriptions)
      .values({
        id,
        url: input.url,
        events: input.events,
        description: input.description ?? null,
        secret,
        active: true,
      })
      .returning()
    await audit(c, 'webhook.create', id, { events: input.events })
    return c.json({ ...serialise(row!), secret }, 201)
  },
)

webhooksRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Webhooks'],
    summary: 'Delete a webhook',
    security,
    middleware: [requireRole(ROLES.ADMIN), requireScope('webhooks:write')] as const,
    request: { params: z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) }) },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const res = await c.var.db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).returning({ id: webhookSubscriptions.id })
    if (!res[0]) return c.json({ error: 'not_found' }, 404)
    await audit(c, 'webhook.delete', id)
    return c.body(null, 204)
  },
)

/** 32 bytes hex — 256 bits of entropy. */
function generateSecret(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}
