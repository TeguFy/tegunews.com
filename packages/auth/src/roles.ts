export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  /**
   * Programmatic principal — non-human. API-key only, no UI surface, no
   * password. Conceptually peers with `author` for content writes; can
   * publish IF the SEO gate passes (same rule as humans). Cannot moderate
   * comments or manage users — guardrail against runaway agents.
   */
  AGENT: 'agent',
  COMMENTER: 'commenter',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export function canPublish(role: Role): boolean {
  return role === ROLES.ADMIN || role === ROLES.EDITOR || role === ROLES.AGENT
}

export function canManageUsers(role: Role): boolean {
  return role === ROLES.ADMIN
}

/** Editors and admins can act on the comment moderation queue. Agents cannot —
 *  intentional: comment moderation is editorial judgement, not automated. */
export function canModerateComments(role: Role): boolean {
  return role === ROLES.ADMIN || role === ROLES.EDITOR
}

export function canEditOthers(role: Role): boolean {
  return role === ROLES.ADMIN || role === ROLES.EDITOR
}

export function canViewAnalytics(role: Role): boolean {
  return role === ROLES.ADMIN || role === ROLES.EDITOR
}

export function canManageSettings(role: Role): boolean {
  return role === ROLES.ADMIN
}

/**
 * All authenticated roles can post comments. Anonymous (no role) is allowed at
 * the API layer when guest commenting is enabled — see comment-policy.ts.
 */
export function canPostComments(role: Role): boolean {
  return (
    role === ROLES.ADMIN ||
    role === ROLES.EDITOR ||
    role === ROLES.AUTHOR ||
    role === ROLES.AGENT ||
    role === ROLES.COMMENTER
  )
}
