/**
 * Hono + OpenAPI app factory.
 */
import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import type { Database } from '@teguns/db'
import type { ValidatedSession } from '@teguns/auth'

export interface ApiBindings {
  DB: D1Database
  MEDIA?: R2Bucket
  CACHE?: KVNamespace
  /** Workers AI binding. Required for routes that generate persona conversations. */
  AI?: Ai
  /** Feature flag — '1'/'true' enables auto-generation on publish. */
  AUTO_GENERATE_CONVERSATIONS?: string
}

export interface ApiVariables {
  db: Database
  session: ValidatedSession | null
  userId: string | null
}

export interface ApiEnv {
  Bindings: ApiBindings
  Variables: ApiVariables
}

export interface CreateApiOptions {
  basePath?: string
}

export function createApi(options: CreateApiOptions = {}): OpenAPIHono<ApiEnv> {
  const basePath = options.basePath ?? ''
  const docPath = `${basePath}/openapi.json`
  const docsPath = `${basePath}/docs`

  const app = new OpenAPIHono<ApiEnv>()

  app.use(async (c, next) => {
    if (c.get('session') === undefined) c.set('session', null)
    if (c.get('userId') === undefined) c.set('userId', null)
    await next()
  })

  app.doc(docPath, {
    openapi: '3.1.0',
    info: { title: 'TeguNews API', version: '1.0.0' },
    servers: [{ url: basePath || '/' }],
  })

  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'ApiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
  })

  app.get(docsPath, swaggerUI({ url: docPath }))

  return app
}
