'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CommentNode } from './comments'

interface Props {
  postId: string
  parentId: string | null
  locale: string
  onSubmitted: (c: CommentNode, status: string) => void
}

export function CommentForm({ postId, parentId, locale, onSubmitted }: Props) {
  const t = useTranslations('comments')
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  // Honeypot — CSS-hidden field. Real users never see it; bots fill every
  // visible field. The route flags this and silently routes to spam.
  const [trap, setTrap] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          parentId: parentId ?? undefined,
          body,
          authorName: name,
          authorEmail: email,
          authorWebsite: website || undefined,
          honeypot: trap || undefined,
          locale,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const created = (await res.json()) as CommentNode & { status: string }
      setBody('')
      onSubmitted(created, created.status)
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('writePlaceholder')}
        required
        minLength={1}
        maxLength={4000}
        rows={4}
        className="w-full rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('name')}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          autoComplete="name"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('email')}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          autoComplete="email"
        />
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder={t('website')}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          autoComplete="url"
        />
      </div>

      {/* Honeypot — visually hidden + autocomplete-off + tabindex out of order.
          Bots filling every visible input also fill this; humans never see it. */}
      <div aria-hidden="true" className="absolute left-[-10000px] h-0 w-0 overflow-hidden">
        <label>
          Website URL (leave blank)
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{t('rules')}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? '…' : t('submit')}
      </button>
    </form>
  )
}
