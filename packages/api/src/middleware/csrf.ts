import type { MiddlewareHandler } from 'hono'
import { validateCsrfToken } from '@teguns/auth'
import type { ApiEnv } from '../app'

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const csrfMiddleware: MiddlewareHandler<ApiEnv> = async (c, next) => {
  if (!STATE_CHANGING.has(c.req.method.toUpperCase())) {
    return next()
  }

  const cookieHeader = c.req.raw.headers.get('cookie') ?? ''
  const cookieToken = parseCookie(cookieHeader, 'csrf_token')
  const headerToken = c.req.header('x-csrf-token') ?? undefined

  if (!validateCsrfToken(cookieToken, headerToken)) {
    return c.json({ error: 'csrf_failed' }, 403)
  }
  return next()
}

function parseCookie(header: string, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    if (k === name) return part.slice(eq + 1).trim()
  }
  return undefined
}
