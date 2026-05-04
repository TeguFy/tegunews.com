/**
 * Admin API surface — mounts the @teguns/api routers behind the admin auth
 * middleware. All routes here require a valid session with editor+ role.
 */
import { createApi } from '@teguns/api'
import { postsRouter } from '@teguns/api/routes/posts'
import { categoriesRouter } from '@teguns/api/routes/categories'
import { tagsRouter } from '@teguns/api/routes/tags'
import { commentsRouter } from '@teguns/api/routes/comments'
import { correctionsRouter } from '@teguns/api/routes/corrections'
import { mediaRouter } from '@teguns/api/routes/media'
import { trendingRouter } from '@teguns/api/routes/trending'
import { webhooksRouter } from '@teguns/api/routes/webhooks'
import { agentPersonasRouter } from '@teguns/api/routes/agent-personas'
import { agentConversationsRouter } from '@teguns/api/routes/agent-conversations'
import { idempotencyMiddleware } from '@teguns/api/middleware/idempotency'
import { authMiddleware } from '@teguns/api/middleware/auth'
import { createDb } from '@teguns/db'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const app = createApi({ basePath: '/api/admin' })

app.use('/api/admin/*', async (c, next) => {
  const { env } = await getCloudflareContext({ async: true })
  c.env.DB = env.DB as unknown as D1Database
  c.env.MEDIA = env.MEDIA as unknown as R2Bucket
  c.env.CACHE = env.CACHE as unknown as KVNamespace
  c.env.AI = (env as { AI?: Ai }).AI
  c.env.AUTO_GENERATE_CONVERSATIONS = (env as { AUTO_GENERATE_CONVERSATIONS?: string }).AUTO_GENERATE_CONVERSATIONS
  c.set('db', createDb(env.DB))
  await next()
})

// Auth: session cookie OR x-api-key. Must come after DB is set (auth reads api_keys table).
app.use('/api/admin/*', authMiddleware)

// Idempotency-Key support — replays cached 2xx response on duplicate calls
// with the same key + userId. Mutations only; GET/HEAD passthrough.
app.use('/api/admin/*', idempotencyMiddleware)

app.route('/api/admin/posts', postsRouter)
// Corrections + trending share the /posts prefix (sub-paths under /posts/...).
app.route('/api/admin/posts', correctionsRouter)
app.route('/api/admin/posts', trendingRouter)
app.route('/api/admin/categories', categoriesRouter)
app.route('/api/admin/tags', tagsRouter)
app.route('/api/admin/comments', commentsRouter)
app.route('/api/admin/media', mediaRouter)
app.route('/api/admin/webhooks', webhooksRouter)
app.route('/api/admin/personas', agentPersonasRouter)
// Mounted under /posts because the resource is post-shaped (`/posts/:id/generate-conversation`).
app.route('/api/admin/posts', agentConversationsRouter)

export const GET = app.fetch
export const POST = app.fetch
export const PUT = app.fetch
export const PATCH = app.fetch
export const DELETE = app.fetch
