export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  COMMENTER: 'commenter',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export function canPublish(role: Role): boolean {
  return role === ROLES.ADMIN || role === ROLES.EDITOR
}

export function canManageUsers(role: Role): boolean {
  return role === ROLES.ADMIN
}

/** Editors and admins can act on the comment moderation queue. */
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
    role === ROLES.COMMENTER
  )
}
