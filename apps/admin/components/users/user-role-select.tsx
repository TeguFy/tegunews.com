'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changeUserRole } from '@/app/actions/change-user-role'

const ROLES = ['admin', 'editor', 'author', 'agent', 'commenter'] as const

interface Props {
  userId: string
  currentRole: string
  disabled?: boolean
}

/**
 * Inline role select. Disabled when the row belongs to the current user —
 * prevents accidental self-demotion that would lock you out. To demote
 * yourself, log in as another admin first.
 *
 * Defensive against unknown roles: if `currentRole` isn't in `ROLES`, we
 * prepend it as a disabled option so the dropdown reflects DB truth instead
 * of silently snapping to the first option (which is `admin` — terrifying).
 */
export function UserRoleSelect({ userId, currentRole, disabled = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isKnownRole = (ROLES as readonly string[]).includes(currentRole)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === currentRole) return
    setError(null)
    startTransition(async () => {
      const res = await changeUserRole(userId, next)
      if (!res.ok) {
        setError(res.error)
        // Revert select visually by refreshing — server didn't apply.
        router.refresh()
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentRole}
        onChange={handleChange}
        disabled={disabled || isPending}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs uppercase tracking-wider focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50"
      >
        {!isKnownRole && (
          <option value={currentRole} disabled>
            {currentRole} (legacy)
          </option>
        )}
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
