'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  publishPostAction,
  unpublishPostAction,
  deletePostAction,
} from '@/app/actions/posts'

interface Props {
  postId: string
  status: 'draft' | 'published' | 'scheduled'
  defaultLocale?: string
}

/**
 * Post-page action buttons. Delete is destructive — guarded by a window
 * prompt asking the user to type the post id. Awkward but no double-click
 * accidents and no extra modal component to maintain.
 */
export function PostActions({ postId, status, defaultLocale = 'en' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handlePublish() {
    setError(null)
    startTransition(async () => {
      const res = await publishPostAction(postId, defaultLocale)
      if (!res.ok) {
        setError(fmtErr(res.error, res.fields))
        return
      }
      router.refresh()
    })
  }

  function handleUnpublish() {
    setError(null)
    startTransition(async () => {
      const res = await unpublishPostAction(postId)
      if (!res.ok) setError(res.error)
      router.refresh()
    })
  }

  function handleDelete() {
    const confirmText = window.prompt(
      `Permanently delete this post? Cascades translations + comments + corrections.\n\nType the first 8 chars of the post id to confirm:\n${postId.slice(0, 8)}`,
    )
    if (confirmText !== postId.slice(0, 8)) {
      setError('Confirmation did not match. Delete cancelled.')
      return
    }
    startTransition(async () => {
      try {
        await deletePostAction(postId)
        // Server action redirects on success — this line unreachable.
      } catch (err) {
        setError(String(err))
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' || status === 'scheduled' ? (
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPending}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? '…' : 'Publish'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleUnpublish}
          disabled={isPending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isPending ? '…' : 'Unpublish'}
        </button>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 whitespace-pre-line">
          {error}
        </p>
      )}
    </div>
  )
}

function fmtErr(error: string, fields?: Array<{ field: string; message: string }>): string {
  if (!fields?.length) return error
  return [error, ...fields.map((f) => `  ${f.field}: ${f.message}`)].join('\n')
}
