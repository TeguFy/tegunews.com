'use server'

import { eq } from 'drizzle-orm'
import { users } from '@teguns/db'
import { getDb } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-session'

const VALID_ROLES = ['admin', 'editor', 'author', 'agent', 'commenter'] as const

/**
 * Change a user's role. Admin-only. The action returns a structured result
 * so the client can render error inline without throwing.
 *
 * Self-demotion guard: the UI disables the select for the current user, but
 * we re-check here in case a client bypassed the disabled state. Otherwise
 * an admin could accidentally lock themselves out and need an SQL recovery.
 */
export async function changeUserRole(
  userId: string,
  role: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAdminSession()
  if (!session) return { ok: false, error: 'unauthorized' }
  if (session.user.role !== 'admin') return { ok: false, error: 'forbidden' }
  if (userId === session.userId) return { ok: false, error: 'cannot_demote_self' }
  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return { ok: false, error: 'invalid_role' }
  }

  const db = await getDb()
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId))
  return { ok: true }
}
