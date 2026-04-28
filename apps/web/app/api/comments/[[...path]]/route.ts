/**
 * Public comments endpoint — proxies through the @teguns/api `commentsRouter`.
 *
 * Catch-all so subpaths (`/api/comments/:id/upvote`) reach the Hono router.
 * The router itself is permissive on its public methods (list, submit,
 * upvote); moderation routes inside the same router require auth and stay
 * effectively unreachable from the public site.
 */
import { createApi } from '@teguns/api'
import { commentsRouter } from '@teguns/api/routes/comments'
import { createDb } from '@teguns/db'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const app = createApi({ basePath: '/api' })

app.use('/api/comments/*', async (c, next) => {
  const { env } = await getCloudflareContext({ async: true })
  c.env.DB = env.DB as unknown as D1Database
  c.set('db', createDb(env.DB))
  await next()
})

app.route('/api/comments', commentsRouter)

export const GET = app.fetch
export const POST = app.fetch
