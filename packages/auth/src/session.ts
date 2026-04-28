/**
 * Session validation against Better Auth's `sessions` table.
 */

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  twoFactorVerified: boolean
}

export interface ValidatedSession {
  id: string
  userId: string
  expiresAt: number
  user: SessionUser
  /**
   * Scopes this principal is allowed to use. Cookie/Bearer sessions get
   * `null` (full role-based access). API-key principals get the key's
   * declared scope list — routes that call `requireScope(...)` reject
   * keys missing the scope, even if the role would otherwise allow it.
   */
  scopes: string[] | null
}

interface SessionRow {
  id: string
  userId: string
  token: string
  expiresAt: number
  ipAddress: string | null
  userAgent: string | null
  revokedAt: number | null
  user: SessionUser
}

interface FindFirstOps {
  eq: (column: unknown, value: unknown) => unknown
}

interface FindFirstArgs {
  where: (
    columns: { token: string },
    ops: FindFirstOps,
  ) => unknown
  with?: { user?: true }
}

export interface SessionDb {
  query: {
    sessions: {
      findFirst: (args: FindFirstArgs) => Promise<SessionRow | undefined>
    }
  }
}

export async function validateSession(
  token: string | undefined,
  db: SessionDb,
): Promise<ValidatedSession | null> {
  if (!token) return null

  const session = await db.query.sessions.findFirst({
    where: (s, { eq }) => eq(s.token, token),
    with: { user: true },
  })

  if (!session) return null

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (session.expiresAt < nowSeconds) return null
  if (session.revokedAt) return null

  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    user: session.user,
    scopes: null,    // cookie/Bearer sessions are not scope-limited
  }
}
