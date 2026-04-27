'use client'

import { useState } from 'react'

interface CommentRowProps {
  comment: {
    id: string
    postId: string
    authorName: string
    authorWebsite: string | null
    authorEmailHash: string | null
    body: string
    bodyHtml: string
    status: string
    createdAt: Date
    locale: string | null
    postTitle: string | null
    postSlug: string | null
  }
}

export function CommentRow({ comment: c }: CommentRowProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function moderate(action: 'approve' | 'spam' | 'reject') {
    if (pending) return
    setPending(action)
    try {
      const res = await fetch(`/api/admin/comments/${c.id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDone(true)
    } catch (err) {
      alert(`Failed: ${err}`)
    } finally {
      setPending(null)
    }
  }

  if (done) return null

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4">
      <header className="mb-2 flex items-center justify-between gap-3 text-xs">
        <div>
          <span className="font-semibold text-zinc-900">{c.authorName}</span>
          {c.authorWebsite && (
            <a href={c.authorWebsite} className="ml-2 text-blue-600 underline" target="_blank" rel="ugc nofollow noopener">
              site
            </a>
          )}
          <span className="ml-2 text-muted-foreground">
            {new Date(c.createdAt).toLocaleString()}
          </span>
          {c.locale && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 uppercase tracking-wider">{c.locale}</span>}
        </div>
        {c.postTitle && c.postSlug && (
          <a href={`/posts/${c.postId}`} className="truncate text-zinc-600 hover:text-zinc-900">
            on: <span className="font-medium">{c.postTitle}</span>
          </a>
        )}
      </header>

      <div className="prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: c.bodyHtml }} />

      <footer className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => moderate('approve')}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending === 'approve' ? '…' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => moderate('spam')}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending === 'spam' ? '…' : 'Spam'}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => moderate('reject')}
          className="rounded-md bg-zinc-700 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending === 'reject' ? '…' : 'Reject'}
        </button>
      </footer>
    </li>
  )
}
