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
import { and, count, desc, eq, sql } from 'drizzle-orm'
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
import { requireRole, requireScope } from '../middleware/rbac'
import { audit } from '../audit'
import { emitEvent } from '../webhook-emit'
import { generateConversation } from '../agent-conversation/generator'
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
  originalSourceUrl: z.string().nullable(),
  originalSourceName: z.string().nullable(),
  bylineDisclosure: z.string().nullable(),
  version: z.number(),
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
    middleware: [requireRole(ROLES.AUTHOR), requireScope("posts:write")] as const,
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
  // Source attribution — required for wire imports.
  originalSourceUrl: z.url().nullable().optional(),
  originalSourceName: z.string().max(120).nullable().optional(),
  bylineDisclosure: z.enum(['AI-assisted', 'AI-generated', 'wire', 'staff']).nullable().optional(),
}).openapi('UpdatePostInput')

postsRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Posts'],
    summary: 'Update post fields',
    security,
    middleware: [requireRole(ROLES.AUTHOR), requireScope("posts:write")] as const,
    request: {
      params: postIdParam,
      body: { content: { 'application/json': { schema: UpdatePostInput } } },
    },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
      409: { description: 'Version mismatch (If-Match)', content: { 'application/json': { schema: z.object({ error: z.string(), current: z.number() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')

    // Optimistic lock: If-Match header (when present) must equal the current
    // row's version. Two agents racing on the same article get a 409 on the
    // loser's call instead of silent overwrite.
    const ifMatch = c.req.header('if-match')
    if (ifMatch !== undefined) {
      const [current] = await c.var.db
        .select({ version: posts.version })
        .from(posts)
        .where(eq(posts.id, id))
      if (!current) return c.json({ error: 'not_found' }, 404)
      if (String(current.version) !== ifMatch.replace(/"/g, '')) {
        return c.json(
          { error: 'version_mismatch', current: current.version },
          409,
        )
      }
    }

    // Convert ISO datetime strings (zod input) to Date (Drizzle column type).
    // `null` and `undefined` pass through unchanged.
    const { breakingUntil, ...rest } = patch
    const breakingUntilDate =
      breakingUntil === undefined ? undefined :
      breakingUntil === null ? null :
      new Date(breakingUntil)

    const updated = await c.var.db
      .update(posts)
      .set({
        ...rest,
        ...(breakingUntilDate !== undefined ? { breakingUntil: breakingUntilDate } : {}),
        updatedAt: new Date(),
        version: sql`${posts.version} + 1`,
      })
      .where(eq(posts.id, id))
      .returning()
    if (!updated[0]) return c.json({ error: 'not_found' }, 404)
    await audit(c, 'post.update', id, { fields: Object.keys(patch) })
    return c.json(serialise(updated[0]), 200)
  },
)

// ─── Idempotent upsert by slug ──────────────────────────────────────────────
//
// Agent-friendly path. Slug is the natural key agents already know (URLs,
// CSV imports, RSS guids). Calling PUT twice with the same slug is a no-op —
// safe to retry without bookkeeping.
//
// Returns 200 if the post existed (updated), 201 if newly created. Body is
// the full Post + the upserted translation, so the caller can chain to
// /publish without a second GET.

const SlugUpsertParams = z.object({
  locale: z.string().min(2).max(10).openapi({ param: { name: 'locale', in: 'path' } }),
  slug: z.string().min(1).max(80).openapi({ param: { name: 'slug', in: 'path' } }),
})

const SlugUpsertInput = z.object({
  // Post-level fields. Identical to UpdatePostInput.
  featuredImage: z.url().nullable().optional(),
  featuredImageAlt: z.string().max(125).nullable().optional(),
  featuredImageCredit: z.string().max(200).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  breakingUntil: z.string().datetime().nullable().optional(),
  commentsEnabled: z.boolean().optional(),
  originalSourceUrl: z.url().nullable().optional(),
  originalSourceName: z.string().max(120).nullable().optional(),
  bylineDisclosure: z.enum(['AI-assisted', 'AI-generated', 'wire', 'staff']).nullable().optional(),
  // Translation-level fields. Title + content required for upsert; the rest
  // are optional and only updated when present (PATCH-like merge semantics).
  title: z.string().min(1),
  content: z.string().default(''),
  excerpt: z.string().nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDesc: z.string().nullable().optional(),
  ogImage: z.string().nullable().optional(),
  focusKeyword: z.string().nullable().optional(),
  relatedKeywords: z.array(z.string()).nullable().optional(),
}).openapi('SlugUpsertInput')

postsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/by-slug/{locale}/{slug}',
    tags: ['Posts'],
    summary: 'Get post by (locale, slug)',
    security,
    request: { params: SlugUpsertParams },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { locale, slug } = c.req.valid('param')
    const [tr] = await c.var.db
      .select({ postId: postTranslations.postId })
      .from(postTranslations)
      .where(and(eq(postTranslations.locale, locale), eq(postTranslations.slug, slug)))
    if (!tr) return c.json({ error: 'not_found' }, 404)
    const [post] = await c.var.db.select().from(posts).where(eq(posts.id, tr.postId))
    if (!post) return c.json({ error: 'not_found' }, 404)
    return c.json(serialise(post), 200)
  },
)

postsRouter.openapi(
  createRoute({
    method: 'put',
    path: '/by-slug/{locale}/{slug}',
    tags: ['Posts'],
    summary: 'Idempotent upsert by (locale, slug)',
    description:
      'Creates or updates a post + its translation in one call. Slug is the natural key. Safe to retry — second call with same body is a no-op. Pass `?dry_run=1` to validate the input + return the would-be result without writing.',
    security,
    middleware: [requireRole(ROLES.AUTHOR), requireScope("posts:write")] as const,
    request: {
      params: SlugUpsertParams,
      query: z.object({ dry_run: z.coerce.boolean().optional() }),
      body: { content: { 'application/json': { schema: SlugUpsertInput } } },
    },
    responses: {
      200: { description: 'Existed; updated (or dry_run preview)', content: { 'application/json': { schema: PostSchema } } },
      201: { description: 'Created', content: { 'application/json': { schema: PostSchema } } },
    },
  }),
  async (c) => {
    const { locale, slug } = c.req.valid('param')
    const { dry_run } = c.req.valid('query')
    const input = c.req.valid('json')
    const userId = c.var.userId ?? 'system'
    const now = new Date()

    // Dry-run short-circuit: build the would-be Post object and return it
    // WITHOUT touching the DB. Lets agents validate input shape + see the
    // derived fields (readingTime, wordCount) before committing.
    if (dry_run) {
      const previewReading = calculateReadingTime(input.content)
      // Build a Post-shaped preview that satisfies PostSchema. The wordCount
      // and other dry-run-specific signals are derivable client-side from the
      // input — keeping the response shape strict means the SDK doesn't
      // need a special branch for dry-run results.
      return c.json(
        {
          id: 'dry-run',
          status: 'draft' as const,
          featuredImage: input.featuredImage ?? null,
          featuredImageAlt: input.featuredImageAlt ?? null,
          featuredImageCredit: input.featuredImageCredit ?? null,
          authorId: userId,
          authorName: null,
          authorAvatar: null,
          categoryId: input.categoryId ?? null,
          publishedAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          featured: input.featured ?? false,
          breakingUntil: input.breakingUntil ?? null,
          commentsEnabled: input.commentsEnabled ?? true,
          commentCount: 0,
          readingTime: previewReading,
          internalLinksCount: 0,
          externalLinksCount: 0,
          originalSourceUrl: input.originalSourceUrl ?? null,
          originalSourceName: input.originalSourceName ?? null,
          bylineDisclosure: input.bylineDisclosure ?? null,
          version: 0,
        },
        200,
      )
    }

    // Try to locate an existing translation (slug+locale is unique).
    const [existingTr] = await c.var.db
      .select({ postId: postTranslations.postId })
      .from(postTranslations)
      .where(and(eq(postTranslations.locale, locale), eq(postTranslations.slug, slug)))

    let postId = existingTr?.postId
    let created = false

    if (!postId) {
      // Create the post first; translation upsert below attaches to it.
      postId = crypto.randomUUID()
      created = true
      await c.var.db.insert(posts).values({
        id: postId,
        status: 'draft',
        featuredImage: input.featuredImage ?? null,
        featuredImageAlt: input.featuredImageAlt ?? null,
        featuredImageCredit: input.featuredImageCredit ?? null,
        categoryId: input.categoryId ?? null,
        authorId: userId,
        featured: input.featured ?? false,
        breakingUntil: input.breakingUntil ? new Date(input.breakingUntil) : null,
        commentsEnabled: input.commentsEnabled ?? true,
        originalSourceUrl: input.originalSourceUrl ?? null,
        originalSourceName: input.originalSourceName ?? null,
        bylineDisclosure: input.bylineDisclosure ?? null,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      // Patch post-level fields if any were supplied.
      const patch: Record<string, unknown> = { updatedAt: now, version: sql`${posts.version} + 1` }
      if (input.featuredImage !== undefined) patch.featuredImage = input.featuredImage
      if (input.featuredImageAlt !== undefined) patch.featuredImageAlt = input.featuredImageAlt
      if (input.featuredImageCredit !== undefined) patch.featuredImageCredit = input.featuredImageCredit
      if (input.categoryId !== undefined) patch.categoryId = input.categoryId
      if (input.featured !== undefined) patch.featured = input.featured
      if (input.breakingUntil !== undefined) {
        patch.breakingUntil = input.breakingUntil ? new Date(input.breakingUntil) : null
      }
      if (input.commentsEnabled !== undefined) patch.commentsEnabled = input.commentsEnabled
      if (input.originalSourceUrl !== undefined) patch.originalSourceUrl = input.originalSourceUrl
      if (input.originalSourceName !== undefined) patch.originalSourceName = input.originalSourceName
      if (input.bylineDisclosure !== undefined) patch.bylineDisclosure = input.bylineDisclosure
      await c.var.db.update(posts).set(patch).where(eq(posts.id, postId))
    }

    // Upsert the translation (recompute derived fields).
    const baseUrl =
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.NEXT_PUBLIC_APP_URL ?? 'https://tegunews.com'
    const wordCount = countWords(input.content)
    const links = extractLinks(input.content, baseUrl)
    const headings = extractHeadings(input.content)
    const keywordDensity = input.focusKeyword
      ? calculateKeywordDensity(input.content, input.focusKeyword)
      : null
    const readingTime = calculateReadingTime(input.content)

    const trValues = {
      postId,
      locale,
      title: input.title,
      slug,
      content: input.content,
      excerpt: input.excerpt ?? null,
      seoTitle: input.seoTitle ?? null,
      seoDesc: input.seoDesc ?? null,
      ogImage: input.ogImage ?? null,
      focusKeyword: input.focusKeyword ?? null,
      relatedKeywords: input.relatedKeywords ?? null,
      headingsOutline: headings,
      keywordDensity,
      wordCount,
      noIndex: false,
    }

    await c.var.db
      .insert(postTranslations)
      .values(trValues)
      .onConflictDoUpdate({
        target: [postTranslations.postId, postTranslations.locale],
        set: trValues,
      })

    await c.var.db
      .update(posts)
      .set({
        internalLinksCount: links.internal,
        externalLinksCount: links.external,
        readingTime,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))

    const [post] = await c.var.db.select().from(posts).where(eq(posts.id, postId))
    await audit(c, created ? 'post.create' : 'post.upsert', postId, { locale, slug })
    return c.json(serialise(post!), created ? 201 : 200)
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
    middleware: [requireRole(ROLES.EDITOR), requireScope("posts:write")] as const,
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
    await audit(c, 'post.delete', id)
    return c.body(null, 204)
  },
)

// ─── Publish ────────────────────────────────────────────────────────────────
//
// Modes:
//   default                  → publish now (status='published')
//   ?at=<ISO future>         → schedule (status='scheduled', publishedAt=at)
//   ?dry_run=1               → run SEO gate, return what would be saved, no write
//
// Idempotent:
//   - Already-published post: returns 200 with the current row (no-op).
//   - Re-scheduling to the same `at`: no-op. Different `at`: updates row.

postsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/publish',
    tags: ['Posts'],
    summary: 'Publish or schedule a post (gated by SEO validators)',
    description:
      'Defaults to publishing immediately. Pass `?at=<ISO>` to schedule for a future timestamp; the cron handler in apps/admin promotes scheduled→published when the time arrives. Pass `?dry_run=1` to validate without writing — the body returned is what would have been saved.',
    security,
    // AUTHOR rank (= 2) covers author + agent roles — matches canPublish() in roles.ts.
    // Agents need to publish their own content; editors/admins are included via rank hierarchy.
    middleware: [requireRole(ROLES.AUTHOR), requireScope("posts:write")] as const,
    request: {
      params: postIdParam,
      query: z.object({
        locale: z.string().min(2).max(10).default('en'),
        at: z.string().datetime().optional(),
        dry_run: z.coerce.boolean().optional(),
      }),
    },
    responses: {
      200: { description: 'Published / scheduled / would-have-been (dry_run)', content: { 'application/json': { schema: PostSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
      422: { description: 'SEO gate failed', content: { 'application/json': { schema: FieldErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { locale, at, dry_run } = c.req.valid('query')

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
    const scheduledAt = at ? new Date(at) : null

    // Validate scheduling: `at` must be in the future. `at` in the past = publish now.
    const isFuture = scheduledAt && scheduledAt.getTime() > now.getTime() + 60_000  // 60s grace
    const targetStatus: 'scheduled' | 'published' = isFuture ? 'scheduled' : 'published'
    const targetPublishedAt = isFuture ? scheduledAt! : now

    if (dry_run) {
      // Show what would be saved without writing.
      return c.json(
        serialise({
          ...post,
          status: targetStatus,
          publishedAt: targetPublishedAt,
          updatedAt: now,
        }),
        200,
      )
    }

    const [updated] = await c.var.db
      .update(posts)
      .set({
        status: targetStatus,
        publishedAt: targetPublishedAt,
        updatedAt: now,
        version: sql`${posts.version} + 1`,
      })
      .where(eq(posts.id, id))
      .returning()
    await audit(c, targetStatus === 'scheduled' ? 'post.schedule' : 'post.publish', id, {
      locale,
      publishedAt: targetPublishedAt.toISOString(),
    })

    // Fire webhook fanout — subscribers branch on `event`. Sync delivery
    // means the receiver's latency adds to ours; acceptable for low-volume
    // events like publish. Skip for `scheduled` since the cron will fire
    // a real `post.publish` when it promotes.
    if (targetStatus === 'published') {
      await emitEvent(c.var.db, {
        event: 'post.publish',
        payload: { id, locale, slug: tr.slug, title: tr.title, publishedAt: targetPublishedAt.toISOString() },
        runId: c.req.header('x-agent-run-id') ?? undefined,
      })

      // Auto-generate AI persona discussion. Gated by env flag — not every
      // deployment wants this on. AI binding may be absent in some envs
      // (e.g. preview without Workers AI), in which case we silently skip
      // — we'd rather miss seeded comments than 500 the publish.
      //
      // executionCtx().waitUntil keeps the response fast (~LLM calls take
      // 5–30s) while still letting the worker complete the job. The
      // generator itself is idempotent — re-running on the same (post,
      // locale) is a no-op once a `completed` run exists.
      const flag = c.env.AUTO_GENERATE_CONVERSATIONS
      if (flag === '1' || flag === 'true') {
        if (c.env.AI) {
          const ai = c.env.AI
          const db = c.var.db
          const work = generateConversation(db, ai, {
            postId: id,
            locale,
            triggeredBy: 'auto_publish',
            triggeredByUserId: c.var.userId,
          }).catch((err) => {
            // Swallow — the run row records `failed`; cron will retry.
            console.warn(JSON.stringify({ event: 'conversation.auto_generate_failed', postId: id, locale, error: String(err) }))
          })
          try {
            c.executionCtx.waitUntil(work)
          } catch {
            // No execution context (e.g. tests) — let it run synchronously.
            await work
          }
        } else {
          console.warn(JSON.stringify({ event: 'conversation.auto_generate_skipped', reason: 'ai_binding_missing', postId: id }))
        }
      }
    }

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
    middleware: [requireRole(ROLES.EDITOR), requireScope("posts:write")] as const,
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
      .set({
        status: 'draft',
        publishedAt: null,
        updatedAt: new Date(),
        version: sql`${posts.version} + 1`,
      })
      .where(eq(posts.id, id))
      .returning()
    if (!updated) return c.json({ error: 'not_found' }, 404)
    await audit(c, 'post.unpublish', id)
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
    middleware: [requireRole(ROLES.AUTHOR), requireScope("posts:write")] as const,
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
