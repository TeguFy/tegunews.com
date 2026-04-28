/**
 * Auth middleware. Tries Bearer/cookie session first, then falls back to the
 * `x-api-key` header. Sets `session` and `userId` on the Hono context.
 *
 * For comment-posting routes that allow anonymous submissions, mount the
 * `optionalAuth` variant — it never returns 401, just sets `session: null`.
 */
import type { MiddlewareHandler } from 'hono'
import { validateSession, verifyApiKey } from '@teguns/auth'
import type { SessionDb, ValidatedSession } from '@teguns/auth'
import { apiKeys } from '@teguns/db'
import { isNull } from 'drizzle-orm'
import type { ApiEnv } from '../app'

const COOKIE_NAME = 'tegunews_session'

export const authMiddleware: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const session = await tryResolveSession(c)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  c.set('session', session)
  c.set('userId', session.userId)
  return next()
}

/**
 * Allows anonymous requests through. Use on `POST /comments` to support guest
 * comments — the route handler decides whether to require identity.
 */
export const optionalAuth: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const session = await tryResolveSession(c)
  if (session) {
    c.set('session', session)
    c.set('userId', session.userId)
  }
  return next()
}

async function tryResolveSession(c: Parameters<MiddlewareHandler<ApiEnv>>[0]): Promise<ValidatedSession | null> {
  const authHeader = c.req.header('authorization')
  const bearer = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : undefined

  const cookieHeader = c.req.raw.headers.get('cookie') ?? ''
  const cookieToken = parseCookie(cookieHeader, COOKIE_NAME)
    ?? parseCookie(cookieHeader, 'better-auth.session_token')
    ?? parseCookie(cookieHeader, '__Secure-better-auth.session_token')

  // Better Auth signed cookies look like `<token>.<sig>` — strip the suffix.
  const sessionToken = (bearer ?? cookieToken)?.split('.')[0]

  if (sessionToken) {
    const db = c.var.db as unknown as SessionDb
    const session = await validateSession(sessionToken, db)
    if (session) return session
  }

  const apiKey = c.req.header('x-api-key')
  if (apiKey) {
    const candidates = await c.var.db
      .select()
      .from(apiKeys)
      .where(isNull(apiKeys.revokedAt))
    for (const k of candidates) {
      if (await verifyApiKey(apiKey, k.keyHash)) {
        const user = await loadKeyUser(c.var.db, k.userId)
        if (!user) continue
        const synthetic: ValidatedSession = {
          id: `apikey:${k.id}`,
          userId: k.userId,
          expiresAt: Math.floor(Date.now() / 1000) + 60,
          user,
          // Key carries declared scopes — `requireScope(...)` enforces them
          // per route. Empty array = no scopes granted (valid auth, useless).
          scopes: k.scopes ?? [],
        }
        return synthetic
      }
    }
  }
  return null
}

interface UserRow {
  id: string
  email: string
  name: string | null
  role: string | null
  twoFactorVerified?: number | boolean | null
}

async function loadKeyUser(
  db: ApiEnv['Variables']['db'],
  userId: string,
): Promise<ValidatedSession['user'] | null> {
  const row = await (db as unknown as { $client?: D1Database }).$client
    ?.prepare('SELECT id, email, name, role, twoFactorVerified FROM user WHERE id = ?1 LIMIT 1')
    .bind(userId)
    .first<UserRow>()
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? row.email,
    role: row.role ?? 'commenter',
    twoFactorVerified: row.twoFactorVerified === 1 || row.twoFactorVerified === true,
  }
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
