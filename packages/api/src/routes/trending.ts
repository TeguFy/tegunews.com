/**
 * Trending posts — agent-facing analytics for "what to feature".
 *
 * Mounted at /api/admin/posts/trending. The score combines comment_count,
 * view_count, and recency. Tunable via query params; defaults are conservative
 * for a small site.
 *
 * Score formula (simple, agent-debuggable):
 *   score = (viewCount * w_view + commentCount * w_comment) * recencyBonus
 *   recencyBonus = max(0, 1 - hoursSincePublish / windowHours)
 *
 * Linear decay over `windowHours` (default 48 = Google News window). After
 * the window, recencyBonus is 0 and the post drops off entirely.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq, gt } from 'drizzle-orm'
import { posts, postTranslations } from '@teguns/db'
import { authMiddleware } from '../middleware/auth'
import type { ApiEnv } from '../app'

export const trendingRouter = new OpenAPIHono<ApiEnv>()
trendingRouter.use('*', authMiddleware)

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]

const TrendingItem = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  locale: z.string(),
  publishedAt: z.string(),
  viewCount: z.number(),
  commentCount: z.number(),
  hoursAgo: z.number(),
  score: z.number(),
}).openapi('TrendingItem')

trendingRouter.openapi(
  createRoute({
    method: 'get',
    path: '/trending',
    tags: ['Posts'],
    summary: 'Top published posts ranked by engagement × recency',
    description:
      'Returns the top N published posts in the given window, ranked by ' +
      '(viewCount * viewWeight + commentCount * commentWeight) * linear-recency. ' +
      'Agents use this to pick what to feature, what to translate next, what to write a follow-up on.',
    security,
    request: {
      query: z.object({
        locale: z.string().min(2).max(10).default('en'),
        window_hours: z.coerce.number().int().min(1).max(720).default(48),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        view_weight: z.coerce.number().min(0).default(1),
        comment_weight: z.coerce.number().min(0).default(20),
      }),
    },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.object({ items: z.array(TrendingItem) }) } },
      },
    },
  }),
  async (c) => {
    const { locale, window_hours, limit, view_weight, comment_weight } = c.req.valid('query')
    const cutoff = new Date(Date.now() - window_hours * 3600 * 1000)
    const now = Date.now()

    const rows = await c.var.db
      .select({
        id: posts.id,
        publishedAt: posts.publishedAt,
        viewCount: posts.viewCount,
        commentCount: posts.commentCount,
        title: postTranslations.title,
        slug: postTranslations.slug,
      })
      .from(posts)
      .innerJoin(
        postTranslations,
        and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale)),
      )
      .where(and(eq(posts.status, 'published'), gt(posts.publishedAt, cutoff)))
      .orderBy(desc(posts.publishedAt))

    const scored = rows
      .map((r) => {
        const hoursAgo = r.publishedAt
          ? (now - r.publishedAt.getTime()) / 3600000
          : window_hours
        const recencyBonus = Math.max(0, 1 - hoursAgo / window_hours)
        const score =
          (r.viewCount * view_weight + r.commentCount * comment_weight) * recencyBonus
        return {
          id: r.id,
          title: r.title,
          slug: r.slug,
          locale,
          publishedAt: r.publishedAt!.toISOString(),
          viewCount: r.viewCount,
          commentCount: r.commentCount,
          hoursAgo: Number(hoursAgo.toFixed(2)),
          score: Number(score.toFixed(2)),
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return c.json({ items: scored }, 200)
  },
)
