/**
 * Media CRUD — list, multipart upload to R2, delete (with R2 object cleanup).
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { desc, eq } from 'drizzle-orm'
import { media } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import type { ApiEnv } from '../app'

export const mediaRouter = new OpenAPIHono<ApiEnv>()
mediaRouter.use('*', authMiddleware)

const MediaSchema = z.object({
  id: z.uuid(),
  r2Key: z.string(),
  url: z.string(),
  mimeType: z.string(),
  size: z.number(),
  altText: z.string().nullable(),
  caption: z.string().nullable(),
  credit: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  uploadedBy: z.string(),
  createdAt: z.string(),
}).openapi('Media')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]
const idParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) })

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
])
const MAX_BYTES = 10 * 1024 * 1024

function serialise(m: typeof media.$inferSelect) {
  return { ...m, createdAt: m.createdAt.toISOString() }
}

mediaRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Media'],
    summary: 'List media',
    security,
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(MediaSchema) }) } } },
    },
  }),
  async (c) => {
    const { limit, offset } = c.req.valid('query')
    const items = await c.var.db.select().from(media).orderBy(desc(media.createdAt)).limit(limit).offset(offset)
    return c.json({ items: items.map(serialise) }, 200)
  },
)

mediaRouter.post('/', requireRole(ROLES.AUTHOR), async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: 'invalid_form' }, 400)

  const file = form.get('file')
  if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400)
  if (file.size === 0) return c.json({ error: 'empty_file' }, 400)
  if (file.size > MAX_BYTES) return c.json({ error: 'file_too_large', max: MAX_BYTES }, 413)
  if (!ALLOWED_MIME.has(file.type)) return c.json({ error: 'mime_not_allowed', mime: file.type }, 415)

  const bucket = c.env.MEDIA
  if (!bucket) return c.json({ error: 'r2_not_bound' }, 500)

  const id = crypto.randomUUID()
  const safeName = file.name.split(/[\\/]/).pop()!.replace(/[^-_.A-Za-z0-9]/g, '_').slice(0, 100) || 'file'
  const r2Key = `media/${id}/${safeName}`

  await bucket.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  const baseUrl =
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
  const url = `${baseUrl}/r2/${r2Key}`

  const altText = form.get('altText')
  const caption = form.get('caption')
  const credit = form.get('credit')

  const [row] = await c.var.db.insert(media).values({
    id,
    r2Key,
    url,
    mimeType: file.type,
    size: file.size,
    altText: typeof altText === 'string' ? altText : null,
    caption: typeof caption === 'string' ? caption : null,
    credit: typeof credit === 'string' ? credit : null,
    uploadedBy: c.var.userId ?? 'system',
  }).returning()

  return c.json(serialise(row!), 201)
})

mediaRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Media'],
    summary: 'Delete media (deletes R2 object too, on best effort)',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { params: idParam },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const [row] = await c.var.db.select({ r2Key: media.r2Key }).from(media).where(eq(media.id, id))
    if (!row) return c.json({ error: 'not_found' }, 404)
    await c.var.db.delete(media).where(eq(media.id, id))
    try { await c.env.MEDIA?.delete(row.r2Key) } catch { /* noop */ }
    return c.body(null, 204)
  },
)
