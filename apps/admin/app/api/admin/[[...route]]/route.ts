/**
 * Admin API surface — mounts the @teguns/api routers behind the admin auth
 * middleware. All routes here require a valid session with editor+ role.
 */
import { createApi } from '@teguns/api'
import { postsRouter } from '@teguns/api/routes/posts'
import { categoriesRouter } from '@teguns/api/routes/categories'
import { tagsRouter } from '@teguns/api/routes/tags'
import { commentsRouter } from '@teguns/api/routes/comments'
import { mediaRouter } from '@teguns/api/routes/media'
import { createDb } from '@teguns/db'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const app = createApi({ basePath: '/api/admin' })

app.use('/api/admin/*', async (c, next) => {
  const { env } = await getCloudflareContext({ async: true })
  c.env.DB = env.DB as unknown as D1Database
  c.env.MEDIA = env.MEDIA as unknown as R2Bucket
  c.set('db', createDb(env.DB))
  await next()
})

app.route('/api/admin/posts', postsRouter)
app.route('/api/admin/categories', categoriesRouter)
app.route('/api/admin/tags', tagsRouter)
app.route('/api/admin/comments', commentsRouter)
app.route('/api/admin/media', mediaRouter)

export const GET = app.fetch
export const POST = app.fetch
export const PUT = app.fetch
export const PATCH = app.fetch
export const DELETE = app.fetch
