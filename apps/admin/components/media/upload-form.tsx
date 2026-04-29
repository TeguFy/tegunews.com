'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
])
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Direct multipart upload to /api/admin/media. Cookie auth carries via the
 * browser fetch — no need for server-action round-trip. Surface validation
 * client-side first (MIME + size) so the user sees a fast reject without
 * burning a Worker request on a 9MB image.
 */
export function MediaUploadForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [credit, setCredit] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setError(null)
    if (f) {
      if (!ALLOWED_MIME.has(f.type)) {
        setError(`MIME ${f.type} not allowed. Use jpeg/png/webp/gif/avif/svg.`)
        setFile(null)
        return
      }
      if (f.size > MAX_BYTES) {
        setError(`File too large: ${(f.size / 1024 / 1024).toFixed(1)} MB > 10 MB.`)
        setFile(null)
        return
      }
    }
    setFile(f)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setError(null)

    startTransition(async () => {
      const form = new FormData()
      form.append('file', file)
      if (altText) form.append('altText', altText)
      if (credit) form.append('credit', credit)

      const res = await fetch('/api/admin/media', { method: 'POST', body: form })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setFile(null)
      setAltText('')
      setCredit('')
      // Reset the file input — `file=null` doesn't clear it, the input keeps
      // the last selected name otherwise. Trigger via key reset.
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-zinc-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">Upload image</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700">File</span>
          <input
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml"
            onChange={handleFileChange}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-zinc-200"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700">Alt text</span>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            maxLength={125}
            placeholder="What's in the image"
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700">Credit</span>
          <input
            type="text"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            placeholder="Photographer / source"
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !file}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? '…' : 'Upload'}
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Max 10 MB. Stored in R2 bucket <code className="rounded bg-zinc-100 px-1">tegunews-media</code>.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  )
}
