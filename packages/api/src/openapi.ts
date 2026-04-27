import type { OpenAPIObjectConfigure } from '@hono/zod-openapi'
import type { ApiEnv } from './app'

export const OPENAPI_DOC_PATH = '/openapi.json'

export const baseDocument: OpenAPIObjectConfigure<ApiEnv, '/openapi.json'> = {
  openapi: '3.1.0',
  info: {
    title: 'TeguNews API',
    version: '1.0.0',
    description:
      'Programmatic access to TeguNews articles, comments, taxonomy, and media.',
  },
  servers: [{ url: '/api' }],
}
