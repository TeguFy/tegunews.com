'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

interface Props {
  initialName: string
  email: string
  role: string
}

/**
 * Profile editor — name only, for now. Email is a primary key in Better
 * Auth's account table; changing it requires a re-verification flow we
 * haven't built. Role changes happen via /users (admin-only), not here.
 */
export function ProfileForm({ initialName, email, role }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setStatus(null)
    setSubmitting(true)
    try {
      const { error } = await authClient.updateUser({ name })
      if (error) {
        setStatus({ ok: false, msg: error.message ?? 'Update failed' })
      } else {
        setStatus({ ok: true, msg: 'Saved' })
        // Refresh server components so the header label picks up the new name.
        router.refresh()
      }
    } catch (err) {
      setStatus({ ok: false, msg: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold tracking-tight">Profile</h2>
      <p className="mt-1 text-sm text-zinc-500">Your display name and account info.</p>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-3 items-baseline gap-3 text-sm">
          <span className="text-zinc-600">Email</span>
          <span className="col-span-2 font-mono text-zinc-900">{email}</span>
        </div>
        <div className="grid grid-cols-3 items-baseline gap-3 text-sm">
          <span className="text-zinc-600">Role</span>
          <span className="col-span-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-zinc-700">
              {role}
            </span>
          </span>
        </div>
        <label className="block text-sm">
          <span className="text-zinc-700">Name</span>
          <input
            type="text"
            required
            minLength={1}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </label>
      </div>

      {status && (
        <p
          role="alert"
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            status.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {status.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || name === initialName}
        className="mt-5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        {submitting ? '…' : 'Save profile'}
      </button>
    </form>
  )
}
