import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { asc, eq } from 'drizzle-orm'
import { tags } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import type { ApiEnv } from '../app'

export const tagsRouter = new OpenAPIHono<ApiEnv>()
tagsRouter.use('*', authMiddleware)

const TagSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  featuredImage: z.string().nullable(),
}).openapi('Tag')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]
const idParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) })

const CreateInput = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case'),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  featuredImage: z.string().nullable().optional(),
}).openapi('CreateTagInput')

const UpdateInput = CreateInput.partial().openapi('UpdateTagInput')

tagsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Tags'],
    summary: 'List tags',
    security,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(TagSchema) }) } } },
    },
  }),
  async (c) => {
    const items = await c.var.db.select().from(tags).orderBy(asc(tags.name))
    return c.json({ items }, 200)
  },
)

tagsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Tags'],
    summary: 'Create tag',
    security,
    middleware: [requireRole(ROLES.AUTHOR)] as const,
    request: { body: { content: { 'application/json': { schema: CreateInput } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: TagSchema } } },
      409: { description: 'Slug taken', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    try {
      const [row] = await c.var.db.insert(tags).values({
        id: crypto.randomUUID(),
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        featuredImage: input.featuredImage ?? null,
      }).returning()
      return c.json(row!, 201)
    } catch (err) {
      if (String(err).includes('UNIQUE')) return c.json({ error: 'slug_taken' }, 409)
      throw err
    }
  },
)

tagsRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Tags'],
    summary: 'Update tag',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { params: idParam, body: { content: { 'application/json': { schema: UpdateInput } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: TagSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const [row] = await c.var.db.update(tags).set(patch).where(eq(tags.id, id)).returning()
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(row, 200)
  },
)

tagsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Tags'],
    summary: 'Delete tag (cascades post_tags)',
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
    const res = await c.var.db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id })
    if (!res[0]) return c.json({ error: 'not_found' }, 404)
    return c.body(null, 204)
  },
)
