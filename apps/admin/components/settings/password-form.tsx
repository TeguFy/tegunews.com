'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/**
 * Password change form. Better Auth's `changePassword` requires the current
 * password (defence against session hijack — stolen cookie shouldn't give
 * password change). Optional `revokeOtherSessions: true` kicks every other
 * device after the change; we default to true because that's the conservative
 * choice for an admin who wants to rotate a leaked password.
 */
export function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    if (next.length < 8) {
      setStatus({ ok: false, msg: 'New password must be at least 8 characters.' })
      return
    }
    if (next !== confirm) {
      setStatus({ ok: false, msg: 'New password and confirmation do not match.' })
      return
    }
    if (next === current) {
      setStatus({ ok: false, msg: 'New password must differ from current.' })
      return
    }

    setStatus(null)
    setSubmitting(true)
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      })
      if (error) {
        setStatus({ ok: false, msg: error.message ?? 'Change failed' })
      } else {
        setStatus({ ok: true, msg: 'Password changed. Other sessions signed out.' })
        setCurrent('')
        setNext('')
        setConfirm('')
      }
    } catch (err) {
      setStatus({ ok: false, msg: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold tracking-tight">Password</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Changing password signs you out of every other device.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="text-zinc-700">Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </label>

        <label className="block text-sm">
          <span className="text-zinc-700">New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </label>

        <label className="block text-sm">
          <span className="text-zinc-700">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
        disabled={submitting}
        className="mt-5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        {submitting ? '…' : 'Change password'}
      </button>
    </form>
  )
}
