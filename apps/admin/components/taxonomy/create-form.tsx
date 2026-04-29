'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCategoryAction, createTagAction } from '@/app/actions/taxonomy'

interface Props {
  kind: 'category' | 'tag'
}

/**
 * Inline create form. The same shape works for both — just swaps the action.
 * Slug auto-derives from name and is editable until the user types in slug;
 * locking the auto-link there avoids surprise on a name typo→fix flow.
 */
export function TaxonomyCreateForm({ kind }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const fn = kind === 'category' ? createCategoryAction : createTagAction
      const res = await fn({ slug, name })
      if (!res.ok) {
        setError(res.error === 'slug_taken' ? `Slug "${slug}" already used.` : res.error)
        return
      }
      setName('')
      setSlug('')
      setSlugTouched(false)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="text"
          required
          placeholder={kind === 'category' ? 'Category name' : 'Tag name'}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          maxLength={80}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        <input
          type="text"
          required
          placeholder="slug"
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
          pattern="[a-z0-9-]+"
          maxLength={60}
          className="rounded-md border border-zinc-300 px-3 py-1.5 font-mono text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        <button
          type="submit"
          disabled={isPending || !name || !slug}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? '…' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  )
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}
