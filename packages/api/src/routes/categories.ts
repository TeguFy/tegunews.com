import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { asc, eq } from 'drizzle-orm'
import { categories } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import type { ApiEnv } from '../app'

export const categoriesRouter = new OpenAPIHono<ApiEnv>()
categoriesRouter.use('*', authMiddleware)

const CategorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDesc: z.string().nullable(),
  featuredImage: z.string().nullable(),
}).openapi('Category')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]
const idParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) })

const CreateInput = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case'),
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDesc: z.string().nullable().optional(),
  featuredImage: z.string().nullable().optional(),
}).openapi('CreateCategoryInput')

const UpdateInput = CreateInput.partial().openapi('UpdateCategoryInput')

categoriesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Categories'],
    summary: 'List categories',
    security,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(CategorySchema) }) } } },
    },
  }),
  async (c) => {
    const items = await c.var.db.select().from(categories).orderBy(asc(categories.name))
    return c.json({ items }, 200)
  },
)

categoriesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Categories'],
    summary: 'Create category',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { body: { content: { 'application/json': { schema: CreateInput } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: CategorySchema } } },
      409: { description: 'Slug taken', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    try {
      const [row] = await c.var.db.insert(categories).values({
        id: crypto.randomUUID(),
        slug: input.slug,
        name: input.name,
        parentId: input.parentId ?? null,
        description: input.description ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDesc: input.seoDesc ?? null,
        featuredImage: input.featuredImage ?? null,
      }).returning()
      return c.json(row!, 201)
    } catch (err) {
      if (String(err).includes('UNIQUE')) return c.json({ error: 'slug_taken' }, 409)
      throw err
    }
  },
)

categoriesRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Categories'],
    summary: 'Update category',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { params: idParam, body: { content: { 'application/json': { schema: UpdateInput } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: CategorySchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const [row] = await c.var.db.update(categories).set(patch).where(eq(categories.id, id)).returning()
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(row, 200)
  },
)

categoriesRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Categories'],
    summary: 'Delete category',
    security,
    middleware: [requireRole(ROLES.ADMIN)] as const,
    request: { params: idParam },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const res = await c.var.db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id })
    if (!res[0]) return c.json({ error: 'not_found' }, 404)
    return c.body(null, 204)
  },
)
