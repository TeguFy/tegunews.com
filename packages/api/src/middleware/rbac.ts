import type { MiddlewareHandler } from 'hono'
import { ROLES } from '@teguns/auth'
import type { Role } from '@teguns/auth'
import type { ApiEnv } from '../app'

// Agents rank with authors — same content-write capability, not editorial.
// Editors/admins outrank agents so a runaway agent can't elevate itself.
const RANK: Record<Role, number> = {
  [ROLES.COMMENTER]: 1,
  [ROLES.AGENT]: 2,
  [ROLES.AUTHOR]: 2,
  [ROLES.EDITOR]: 3,
  [ROLES.ADMIN]: 4,
}

function rankOf(role: string): number {
  return RANK[role as Role] ?? 0
}

export function requireRole(minRole: Role): MiddlewareHandler<ApiEnv> {
  const required = RANK[minRole]
  return async (c, next) => {
    const session = c.var.session
    if (!session) {
      return c.json({ error: 'forbidden', reason: 'no_session' }, 403)
    }
    if (rankOf(session.user.role) < required) {
      return c.json(
        { error: 'forbidden', reason: 'insufficient_role' },
        403,
      )
    }
    return next()
  }
}

/**
 * Require an API-key scope. Cookie/Bearer sessions (`scopes === null`) bypass
 * — humans aren't scope-limited; only API keys are. The intent is to limit
 * blast radius if a key leaks: a `posts:write` key cannot reach
 * `comments:moderate` even if the underlying role would allow it.
 *
 * Wildcard: granted scope `posts:*` satisfies required `posts:write`,
 * `posts:read`, etc. Useful for grouping when issuing internal-admin keys.
 */
export function requireScope(scope: string): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const session = c.var.session
    if (!session) {
      return c.json({ error: 'forbidden', reason: 'no_session' }, 403)
    }
    if (session.scopes === null) {
      return next()    // Cookie/Bearer principal — not scope-limited.
    }
    if (!hasScope(session.scopes, scope)) {
      return c.json(
        { error: 'forbidden', reason: 'missing_scope', required: scope },
        403,
      )
    }
    return next()
  }
}

function hasScope(granted: string[], required: string): boolean {
  return granted.some((g) => {
    if (g === required) return true
    // Prefix wildcard: granted='posts:*' satisfies required='posts:write'
    if (g.endsWith(':*') && required.startsWith(g.slice(0, -1))) return true
    return false
  })
}
