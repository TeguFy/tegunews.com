'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PostEditor } from './post-editor'
import { upsertPostAction, type UpsertInput } from '@/app/actions/posts'

interface Category { id: string; name: string; slug: string }

interface Props {
  /** Pre-fill values for edit mode. Omit for new-post. */
  initial?: Partial<UpsertInput> & { id?: string }
  categories: Category[]
  /** When true, the form is in "create" mode and redirects to edit on success. */
  isCreate: boolean
}

const LOCALES = ['en', 'vi'] as const
const DISCLOSURES = ['', 'staff', 'AI-assisted', 'AI-generated', 'wire'] as const

/**
 * Shared post form. Both `/posts/new` and `/posts/[id]/edit` render it.
 *
 * On submit:
 *   - new mode → upsert + redirect to /posts/{id}/edit (so the editor can
 *     publish, see version, etc.)
 *   - edit mode → upsert in place, show "Saved" toast.
 *
 * Slug auto-generation: when creating, the slug field tracks the title via
 * a kebab-case slugifier UNTIL the user edits the slug manually. We track
 * "did the user touch slug" via `slugTouched` so retroactive title edits
 * don't clobber a deliberate slug choice.
 */
export function PostForm({ initial, categories, isCreate }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [slugTouched, setSlugTouched] = useState(!isCreate)

  const [locale, setLocale] = useState(initial?.locale ?? 'en')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? '')
  const [seoDesc, setSeoDesc] = useState(initial?.seoDesc ?? '')
  const [focusKeyword, setFocusKeyword] = useState(initial?.focusKeyword ?? '')
  const [featuredImage, setFeaturedImage] = useState(initial?.featuredImage ?? '')
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initial?.featuredImageAlt ?? '')
  const [featuredImageCredit, setFeaturedImageCredit] = useState(initial?.featuredImageCredit ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [bylineDisclosure, setBylineDisclosure] = useState(initial?.bylineDisclosure ?? '')

  function onTitleChange(v: string) {
    setTitle(v)
    if (isCreate && !slugTouched) setSlug(slugify(v))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    startTransition(async () => {
      const res = await upsertPostAction({
        locale,
        slug,
        title,
        content,
        excerpt: excerpt || undefined,
        seoTitle: seoTitle || undefined,
        seoDesc: seoDesc || undefined,
        focusKeyword: focusKeyword || undefined,
        featuredImage: featuredImage || undefined,
        featuredImageAlt: featuredImageAlt || undefined,
        featuredImageCredit: featuredImageCredit || undefined,
        categoryId: categoryId || undefined,
        bylineDisclosure: (bylineDisclosure || undefined) as UpsertInput['bylineDisclosure'],
      })
      if (!res.ok) {
        setStatus({ ok: false, msg: fmtError(res.error, res.fields) })
        return
      }
      const id = (res.data as { id: string }).id
      if (isCreate) {
        router.push(`/posts/${id}/edit`)
        router.refresh()
      } else {
        setStatus({ ok: true, msg: 'Saved.' })
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Main column */}
        <div className="space-y-4">
          <Field label="Title" required>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={110}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <Hint>{title.length}/110 chars</Hint>
          </Field>

          <Field label="Slug" required>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
              maxLength={80}
              pattern="[a-z0-9-]+"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <Hint>kebab-case, max 80 chars. URL: /{locale}/news/{slug || '<slug>'}</Hint>
          </Field>

          <Field label="Excerpt">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              maxLength={300}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </Field>

          <Field label="Content" required>
            <PostEditor value={content} onChange={setContent} />
          </Field>
        </div>

        {/* Sidebar column */}
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Publication</h3>
            <Field label="Locale">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                disabled={!isCreate}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
              >
                {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              {!isCreate && <Hint>Locale of an existing translation cannot change. Add a new translation by creating with a different locale + slug.</Hint>}
            </Field>

            <Field label="Category">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">— uncategorised —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>

            <Field label="Byline disclosure">
              <select
                value={bylineDisclosure}
                onChange={(e) => setBylineDisclosure(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                {DISCLOSURES.map((d) => (
                  <option key={d} value={d}>{d || '— staff (default) —'}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">SEO</h3>
            <Field label="SEO title">
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                maxLength={70}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <Hint>{seoTitle.length}/70 (target 30-70)</Hint>
            </Field>
            <Field label="SEO description">
              <textarea
                value={seoDesc}
                onChange={(e) => setSeoDesc(e.target.value)}
                rows={3}
                maxLength={160}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <Hint>{seoDesc.length}/160 (target 120-160)</Hint>
            </Field>
            <Field label="Focus keyword">
              <input
                type="text"
                value={focusKeyword}
                onChange={(e) => setFocusKeyword(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Featured image</h3>
            <Field label="URL">
              <input
                type="url"
                value={featuredImage}
                onChange={(e) => setFeaturedImage(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Alt">
              <input
                type="text"
                value={featuredImageAlt}
                onChange={(e) => setFeaturedImageAlt(e.target.value)}
                maxLength={125}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Credit">
              <input
                type="text"
                value={featuredImageCredit}
                onChange={(e) => setFeaturedImageCredit(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </div>
      </div>

      {status && (
        <p
          role="alert"
          className={`rounded-md px-3 py-2 text-sm ${
            status.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700 whitespace-pre-line'
          }`}
        >
          {status.msg}
        </p>
      )}

      <div className="sticky bottom-0 -mx-8 flex justify-between gap-3 border-t border-zinc-200 bg-white px-8 py-3">
        <button
          type="button"
          onClick={() => router.push('/posts')}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? '…' : isCreate ? 'Create draft' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-zinc-500">{children}</p>
}

function fmtError(error: string, fields?: Array<{ field: string; message: string }>): string {
  if (!fields?.length) return error
  return [error, ...fields.map((f) => `  ${f.field}: ${f.message}`)].join('\n')
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
    .slice(0, 80)
}
