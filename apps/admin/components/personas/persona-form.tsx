'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AgentPersona } from '@teguns/db'

const TONES = ['formal', 'casual', 'sarcastic', 'enthusiastic', 'analytical', 'skeptical'] as const
const LEANINGS = ['left', 'center-left', 'center', 'center-right', 'right', 'apolitical'] as const
const LANGUAGES = ['auto', 'en', 'vi'] as const

type Tone = (typeof TONES)[number]
type Leaning = (typeof LEANINGS)[number]

interface Props {
  initial?: AgentPersona
  isCreate?: boolean
}

interface FormState {
  slug: string
  displayName: string
  avatarUrl: string
  bio: string
  tone: Tone
  politicalLeaning: Leaning | ''
  personalityTraits: string[]
  expertiseAreas: string[]
  writingStyle: string
  languagePreference: string[]
  systemPrompt: string
  active: boolean
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Persona create/edit form. Single component handles both modes — `isCreate`
 * gates POST vs PATCH and disables the slug field once a persona exists,
 * since the slug is the stable key agents use to reference personas.
 *
 * Right column renders a deterministic preview of how the trait+tone+style
 * fields compose into "voice". When `systemPrompt` is non-empty we hide the
 * preview entirely — the override replaces the composed prompt, so any
 * derived hints would be misleading.
 */
export function PersonaForm({ initial, isCreate = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [state, setState] = useState<FormState>(() => ({
    slug: initial?.slug ?? '',
    displayName: initial?.displayName ?? '',
    avatarUrl: initial?.avatarUrl ?? '',
    bio: initial?.bio ?? '',
    tone: (initial?.tone ?? 'casual') as Tone,
    politicalLeaning: (initial?.politicalLeaning ?? '') as Leaning | '',
    personalityTraits: initial?.personalityTraits ?? [],
    expertiseAreas: initial?.expertiseAreas ?? [],
    writingStyle: initial?.writingStyle ?? '',
    languagePreference: initial?.languagePreference?.length
      ? initial.languagePreference
      : ['en'],
    systemPrompt: initial?.systemPrompt ?? '',
    active: initial?.active ?? true,
  }))

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  function onSlugChange(v: string) {
    patch('slug', v)
    if (!v) setSlugError('Slug is required.')
    else if (!SLUG_RE.test(v)) setSlugError('Use kebab-case: lowercase letters, numbers, hyphens.')
    else setSlugError(null)
  }

  function toggleLanguage(lang: string) {
    setState((s) => {
      const has = s.languagePreference.includes(lang)
      // 'auto' is exclusive: picking it clears fixed locales, and picking
      // any fixed locale clears 'auto'. Mixing them is redundant — 'auto'
      // already matches everything.
      if (!has) {
        if (lang === 'auto') return { ...s, languagePreference: ['auto'] }
        const without = s.languagePreference.filter((l) => l !== 'auto')
        return { ...s, languagePreference: [...without, lang] }
      }
      const next = s.languagePreference.filter((l) => l !== lang)
      // Don't let the list go empty — fall back to 'auto' as the safest default.
      return { ...s, languagePreference: next.length === 0 ? ['auto'] : next }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (isCreate && (!state.slug || slugError)) {
      setSlugError(slugError ?? 'Slug is required.')
      return
    }
    if (!state.displayName.trim()) {
      setError('Display name is required.')
      return
    }

    const body = {
      slug: state.slug,
      displayName: state.displayName,
      avatarUrl: state.avatarUrl || null,
      bio: state.bio || null,
      tone: state.tone,
      politicalLeaning: state.politicalLeaning || null,
      personalityTraits: state.personalityTraits,
      expertiseAreas: state.expertiseAreas,
      writingStyle: state.writingStyle || null,
      languagePreference: state.languagePreference,
      systemPrompt: state.systemPrompt || null,
      active: state.active,
    }

    startTransition(async () => {
      try {
        const url = isCreate
          ? '/api/admin/personas'
          : `/api/admin/personas/${initial!.id}`
        const res = await fetch(url, {
          method: isCreate ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string; fields?: Array<{ field: string; message: string }> }
            | null
          setError(fmtError(data?.error ?? `HTTP ${res.status}`, data?.fields))
          return
        }
        router.push('/personas')
        router.refresh()
      } catch (err) {
        setError(String(err))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Form column */}
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Identity</h3>
            <Field label="Slug" required>
              <input
                type="text"
                required
                value={state.slug}
                disabled={!isCreate}
                onChange={(e) => onSlugChange(e.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={64}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
              {slugError ? (
                <p className="mt-1 text-xs text-red-600">{slugError}</p>
              ) : (
                <Hint>
                  {isCreate
                    ? 'Stable identifier. kebab-case, max 64 chars. Cannot change later.'
                    : 'Slug is immutable once a persona is created.'}
                </Hint>
              )}
            </Field>

            <Field label="Display name" required>
              <input
                type="text"
                required
                value={state.displayName}
                onChange={(e) => patch('displayName', e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </Field>

            <Field label="Avatar URL">
              <input
                type="url"
                value={state.avatarUrl}
                onChange={(e) => patch('avatarUrl', e.target.value)}
                placeholder="https://…"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Bio">
              <textarea
                value={state.bio}
                onChange={(e) => patch('bio', e.target.value)}
                rows={4}
                maxLength={500}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </Field>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Voice</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tone">
                <select
                  value={state.tone}
                  onChange={(e) => patch('tone', e.target.value as Tone)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Political leaning">
                <select
                  value={state.politicalLeaning}
                  onChange={(e) => patch('politicalLeaning', e.target.value as Leaning | '')}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">— unspecified —</option>
                  {LEANINGS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Personality traits">
              <ChipInput
                values={state.personalityTraits}
                onChange={(next) => patch('personalityTraits', next)}
                placeholder="Add trait, press Enter…"
              />
              <Hint>e.g. curious, contrarian, data-driven. Press Enter or comma to add.</Hint>
            </Field>

            <Field label="Expertise areas">
              <ChipInput
                values={state.expertiseAreas}
                onChange={(next) => patch('expertiseAreas', next)}
                placeholder="Add topic, press Enter…"
              />
              <Hint>e.g. economics, climate, urban planning.</Hint>
            </Field>

            <Field label="Writing style">
              <textarea
                value={state.writingStyle}
                onChange={(e) => patch('writingStyle', e.target.value)}
                rows={3}
                placeholder="Writes in short punchy sentences, uses one rhetorical question per comment."
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Language preference">
              <div className="flex flex-wrap gap-3 text-sm">
                {LANGUAGES.map((lang) => (
                  <label key={lang} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.languagePreference.includes(lang)}
                      onChange={() => toggleLanguage(lang)}
                      className="rounded border-zinc-300"
                    />
                    <span className="font-mono uppercase tracking-wider">{lang}</span>
                  </label>
                ))}
              </div>
              <Hint>
                <strong>Auto</strong> = match the locale of the post (or comment thread) being replied to.
                Pick fixed locales to restrict this persona to specific languages only.
              </Hint>
            </Field>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold">System prompt override (advanced)</h3>
            <p className="mb-3 text-xs text-zinc-500">
              When set, replaces the composed prompt entirely. Leave empty to use trait-based composition.
            </p>
            <textarea
              value={state.systemPrompt}
              onChange={(e) => patch('systemPrompt', e.target.value)}
              rows={8}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.active}
                onChange={(e) => patch('active', e.target.checked)}
                className="rounded border-zinc-300"
              />
              <span className="font-medium text-zinc-700">Active</span>
            </label>
            <p className="mt-1 text-xs text-zinc-500">
              Inactive personas keep their history but are skipped by generation runs.
            </p>
          </div>
        </div>

        {/* Preview column */}
        <div className="space-y-4">
          <div className="sticky top-4 rounded-md border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Preview
            </h3>
            <PreviewPanel state={state} />
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-8 flex justify-between gap-3 border-t border-zinc-200 bg-white px-8 py-3">
        <button
          type="button"
          onClick={() => router.push('/personas')}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? '…' : isCreate ? 'Create persona' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function PreviewPanel({ state }: { state: FormState }) {
  const summary = useMemo(() => {
    if (state.systemPrompt.trim()) return null
    const lines: string[] = []
    lines.push(`Speaks in a ${state.tone} tone.`)
    if (state.politicalLeaning) {
      lines.push(`Political leaning: ${state.politicalLeaning}.`)
    } else {
      lines.push('No declared political leaning.')
    }
    if (state.personalityTraits.length > 0) {
      lines.push(`Traits: ${state.personalityTraits.join(', ')}.`)
    }
    if (state.expertiseAreas.length > 0) {
      lines.push(`Comments most on: ${state.expertiseAreas.join(', ')}.`)
    }
    if (state.writingStyle.trim()) {
      lines.push(`Style: ${state.writingStyle.trim()}`)
    }
    if (state.languagePreference.length > 0) {
      const langs = state.languagePreference
      if (langs.includes('auto')) {
        lines.push(`Replies in: matches the post's language.`)
      } else {
        lines.push(`Replies in: ${langs.join(', ')}.`)
      }
    }
    return lines
  }, [state])

  if (summary === null) {
    return (
      <p className="rounded border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        Using custom system prompt — preview disabled.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5 text-sm text-zinc-700">
      {summary.map((line, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-zinc-400">•</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  )
}

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const v = raw.trim()
    if (!v) return
    if (values.includes(v)) {
      setDraft('')
      return
    }
    onChange([...values, v])
    setDraft('')
  }

  function remove(i: number) {
    onChange(values.filter((_, idx) => idx !== i))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2 py-1.5 focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800"
        >
          {v}
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-violet-500 hover:text-violet-900"
            aria-label={`Remove ${v}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={values.length === 0 ? placeholder : ''}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none"
      />
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
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
