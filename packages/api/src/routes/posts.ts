/**
 * News articles (admin scope) — full CRUD + publish workflow + translations.
 *
 * Mounted at `/api/admin/posts`. Auth via session/cookie/Bearer or x-api-key.
 *
 * Publish endpoint runs `validatePostForPublish` + `validateTranslationForPublish`
 * from @teguns/seo against the named locale (?locale=, default "en"). Returns
 * 422 with field-level errors if the draft fails the SEO gate.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, count, desc, eq } from 'drizzle-orm'
import { posts, postTranslations } from '@teguns/db'
import {
  validatePostForPublish,
  validateTranslationForPublish,
  countWords,
  extractLinks,
  extractHeadings,
  calculateKeywordDensity,
  calculateReadingTime,
} from '@teguns/seo'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import type { ApiEnv } from '../app'

export const postsRouter = new OpenAPIHono<ApiEnv>()
postsRouter.use('*', authMiddleware)

// ─── Shared schemas ─────────────────────────────────────────────────────────

const PostStatus = z.enum(['draft', 'published', 'scheduled'])

const PostSchema = z.object({
  id: z.uuid(),
  status: PostStatus,
  featuredImage: z.url().nullable(),
  featuredImageAlt: z.string().nullable(),
  featuredImageCredit: z.string().nullable(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  authorAvatar: z.string().nullable(),
  categoryId: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  featured: z.boolean(),
  breakingUntil: z.string().nullable(),
  commentsEnabled: z.boolean(),
  commentCount: z.number(),
  readingTime: z.number().nullable(),
  internalLinksCount: z.number(),
  externalLinksCount: z.number(),
}).openapi('Post')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const FieldErrorSchema = z.object({
  error: z.string(),
  fields: z.array(z.object({ field: z.string(), message: z.string() })),
}).openapi('ValidationError')

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]

const postIdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const localeParam = z.string().min(2).max(10).openapi({ param: { name: 'locale', in: 'path' } })

function serialise(p: typeof posts.$inferSelect) {
  return {
    ...p,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    breakingUntil: p.breakingUntil ? p.breakingUntil.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

// ─── List ───────────────────────────────────────────────────────────────────

postsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Posts'],
    summary: 'List news articles',
    security,
    request: {
      query: z.object({
        status: PostStatus.optional(),
        featured: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      }),
    },
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': {
            schema: z.object({ items: z.array(PostSchema), total: z.number() }),
          },
        },
      },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { status, featured, limit, offset } = c.req.valid('query')
    const where = and(
      status ? eq(posts.status, status) : undefined,
      featured !== undefined ? eq(posts.featured, featured) : undefined,
    )
    const [items, totalRow] = await Promise.all([
      c.var.db.select().from(posts).where(where).orderBy(desc(posts.updatedAt)).limit(limit).offset(offset),
      c.var.db.select({ c: count() }).from(posts).where(where),
    ])
    return c.json({ items: items.map(serialise), total: totalRow[0]?.c ?? 0 }, 200)
  },
)

// ─── Get ────────────────────────────────────────────────────────────────────

postsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Posts'],
    summary: 'Get a post by id',
    security,
    request: { params: postIdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const [p] = await c.var.db.select().from(posts).where(eq(posts.id, id))
    if (!p) return c.json({ error: 'not_found' }, 404)
    return c.json(serialise(p), 200)
  },
)

// ─── Create ─────────────────────────────────────────────────────────────────

const CreatePostInput = z.object({
  featuredImage: z.url().nullable().optional(),
  featuredImageAlt: z.string().max(125).nullable().optional(),
  featuredImageCredit: z.string().max(200).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  initialTranslation: z.object({
    locale: z.string().min(2).max(10),
    title: z.string().min(1),
    slug: z.string().min(1),
    content: z.string().default(''),
  }).optional(),
}).openapi('CreatePostInput')

postsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Posts'],
    summary: 'Create a draft article',
    security,
    middleware: [requireRole(ROLES.AUTHOR)] as const,
    request: { body: { content: { 'application/json': { schema: CreatePostInput } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: PostSchema } } },
      403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    const userId = c.var.userId ?? 'system'
    const id = crypto.randomUUID()
    const now = new Date()
    const inserted = await c.var.db.insert(posts).values({
      id,
      status: 'draft',
      featuredImage: input.featuredImage ?? null,
      featuredImageAlt: input.featuredImageAlt ?? null,
      featuredImageCredit: input.featuredImageCredit ?? null,
      categoryId: input.categoryId ?? null,
      authorId: userId,
      featured: input.featured ?? false,
      commentsEnabled: input.commentsEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    }).returning()
    if (input.initialTranslation) {
      const t = input.initialTranslation
      await c.var.db.insert(postTranslations).values({
        postId: id,
        locale: t.locale,
        title: t.title,
        slug: t.slug,
        content: t.content,
        headingsOutline: extractHeadings(t.content),
        wordCount: countWords(t.content),
      })
    }
    return c.json(serialise(inserted[0]!), 201)
  },
)

// ─── Update (PATCH) ─────────────────────────────────────────────────────────

const UpdatePostInput = z.object({
  featuredImage: z.url().nullable().optional(),
  featuredImageAlt: z.string().max(125).nullable().optional(),
  featuredImageCredit: z.string().max(200).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  breakingUntil: z.string().datetime().nullable().optional(),
  commentsEnabled: z.boolean().optional(),
}).openapi('UpdatePostInput')

postsRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Posts'],
    summary: 'Update post fields',
    security,
    middleware: [requireRole(ROLES.AUTHOR)] as const,
    request: {
      params: postIdParam,
      body: { content: { 'application/json': { schema: UpdatePostInput } } },
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const updated = await c.var.db
      .update(posts)
      .set({
        ...patch,
        breakingUntil: patch.breakingUntil ? new Date(patch.breakingUntil) : patch.breakingUntil,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id))
      .returning()
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    return c.json(serialise(updated[0]), 200)
  },
)

// ─── Delete ─────────────────────────────────────────────────────────────────

postsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Posts'],
    summary: 'Delete a post (cascades translations + tags + comments)',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { params: postIdParam },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const res = await c.var.db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id })
    if (!res[0]) return c.json({ error: 'not_found' }, 404)
    return c.body(null, 204)
  },
)

// ─── Publish ────────────────────────────────────────────────────────────────

postsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/publish',
    tags: ['Posts'],
    summary: 'Publish a post (gated by SEO validators)',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: {
      params: postIdParam,
      query: z.object({ locale: z.string().min(2).max(10).default('en') }),
    },
    responses: {
      200: { description: 'Published', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
      422: { description: 'SEO gate failed', content: { 'application/json': { schema: FieldErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { locale } = c.req.valid('query')
    const [post] = await c.var.db.select().from(posts).where(eq(posts.id, id))
    if (!post) return c.json({ error: 'not_found' }, 404)
    const [tr] = await c.var.db
      .select()
      .from(postTranslations)
      .where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, locale)))
    if (!tr) {
      return c.json(
        { error: 'translation_missing', fields: [{ field: `translations.${locale}`, message: `No ${locale} translation` }] },
        422,
      )
    }
    const errors = [...validatePostForPublish(post), ...validateTranslationForPublish(tr)]
    if (errors.length) return c.json({ error: 'seo_gate_failed', fields: errors }, 422)
    const now = new Date()
    const [updated] = await c.var.db
      .update(posts)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(posts.id, id))
      .returning()
    return c.json(serialise(updated!), 200)
  },
)

// ─── Unpublish ──────────────────────────────────────────────────────────────

postsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/unpublish',
    tags: ['Posts'],
    summary: 'Unpublish (status → draft)',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { params: postIdParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const [updated] = await c.var.db
      .update(posts)
      .set({ status: 'draft', publishedAt: null, updatedAt: new Date() })
      .where(eq(posts.id, id))
      .returning()
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(serialise(updated), 200)
  },
)

// ─── Translations ───────────────────────────────────────────────────────────

const TranslationInput = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().default(''),
  excerpt: z.string().nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDesc: z.string().nullable().optional(),
  ogImage: z.string().nullable().optional(),
  focusKeyword: z.string().nullable().optional(),
  ogType: z.string().nullable().optional(),
  twitterCard: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
  noIndex: z.boolean().optional(),
  relatedKeywords: z.array(z.string()).nullable().optional(),
}).openapi('TranslationInput')

const TranslationSchema = TranslationInput.extend({
  postId: z.string(),
  locale: z.string(),
  wordCount: z.number(),
  keywordDensity: z.number().nullable(),
  headingsOutline: z.array(z.object({ level: z.number(), text: z.string(), id: z.string() })).nullable(),
}).openapi('Translation')

postsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/translations/{locale}',
    tags: ['Translations'],
    summary: 'Upsert translation for locale (recomputes derived fields)',
    security,
    middleware: [requireRole(ROLES.AUTHOR)] as const,
    request: {
      params: postIdParam.extend({ locale: localeParam }),
      body: { content: { 'application/json': { schema: TranslationInput } } },
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: TranslationSchema } } },
      404: { description: 'Post not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id, locale } = c.req.valid('param')
    const body = c.req.valid('json')
    const [post] = await c.var.db.select({ id: posts.id }).from(posts).where(eq(posts.id, id))
    if (!post) return c.json({ error: 'post_not_found' }, 404)

    const baseUrl =
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
    const wordCount = countWords(body.content)
    const links = extractLinks(body.content, baseUrl)
    const headings = extractHeadings(body.content)
    const keywordDensity = body.focusKeyword
      ? calculateKeywordDensity(body.content, body.focusKeyword)
      : null
    const readingTime = calculateReadingTime(body.content)

    const values = {
      postId: id,
      locale,
      title: body.title,
      slug: body.slug,
      content: body.content,
      excerpt: body.excerpt ?? null,
      seoTitle: body.seoTitle ?? null,
      seoDesc: body.seoDesc ?? null,
      ogImage: body.ogImage ?? null,
      focusKeyword: body.focusKeyword ?? null,
      ogType: body.ogType ?? null,
      twitterCard: body.twitterCard ?? null,
      canonicalUrl: body.canonicalUrl ?? null,
      noIndex: body.noIndex ?? false,
      relatedKeywords: body.relatedKeywords ?? null,
      headingsOutline: headings,
      keywordDensity,
      wordCount,
    }

    const [upserted] = await c.var.db
      .insert(postTranslations)
      .values(values)
      .onConflictDoUpdate({
        target: [postTranslations.postId, postTranslations.locale],
        set: values,
      })
      .returning()

    await c.var.db
      .update(posts)
      .set({
        internalLinksCount: links.internal,
        externalLinksCount: links.external,
        readingTime,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id))

    return c.json(upserted!, 200)
  },
)
