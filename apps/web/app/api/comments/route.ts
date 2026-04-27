/**
 * Public comments endpoint — proxies through the @teguns/api `commentsRouter`.
 *
 * Mounted on the public site so the article-page island can fetch + submit
 * comments without going through the admin domain. Only the public methods
 * (`GET` list and `POST` submit) are exposed here. Moderation routes stay on
 * the admin worker behind the editor RBAC gate.
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
