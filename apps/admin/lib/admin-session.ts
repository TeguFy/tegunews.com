/**
 * Shared admin-session resolver for API routes that need auth without redirect
 * semantics. Returns the validated session or null.
 */
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createDb } from '@teguns/db'
import {
  canModerateComments,
  validateSession,
  type Role,
  type SessionDb,
  type ValidatedSession,
} from '@teguns/auth'

const COOKIE_NAMES = [
  'tegunews_session',
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
]

export async function getAdminSession(): Promise<ValidatedSession | null> {
  const c = await cookies()
  const raw = COOKIE_NAMES.map((n) => c.get(n)?.value).find(Boolean)
  if (!raw) return null
  const token = raw.split('.')[0]!

  try {
    const { env } = await getCloudflareContext()
    const db = createDb(env.DB) as unknown as SessionDb
    const session = await validateSession(token, db)
    if (!session) return null
    if (!canModerateComments(session.user.role as Role)) return null
    return session
  } catch {
    return null
  }
}
