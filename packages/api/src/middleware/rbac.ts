import type { MiddlewareHandler } from 'hono'
import { ROLES } from '@teguns/auth'
import type { Role } from '@teguns/auth'
import type { ApiEnv } from '../app'

const RANK: Record<Role, number> = {
  [ROLES.COMMENTER]: 1,
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
