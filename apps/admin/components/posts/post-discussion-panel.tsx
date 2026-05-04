'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AgentPersona, ConversationRun } from '@teguns/db'

interface Props {
  postId: string
  locale: string
}

interface PreviewComment {
  personaId: string
  personaName?: string
  body: string
  replyTo?: string | null
}

interface GenerateResponse {
  runId: string
  status: string
  commentIds?: string[]
  skipped?: boolean
  preview?: PreviewComment[]
  error?: string
  fields?: Array<{ field: string; message: string }>
}

const DEPTHS = [1, 2, 3] as const

/**
 * Article-level AI discussion panel.
 *
 * Mounted above the post form on the edit page. Surfaces:
 *   - The latest conversation run for this (post, locale).
 *   - A "Generate" form that lets editors pick personas + depth + dry-run.
 *   - History accordion of every run, newest first.
 *
 * Loading is intentionally minimal (one effect on mount). After a real
 * generation we call `router.refresh()` so the underlying comment list
 * (rendered elsewhere) picks up the new rows.
 */
export function PostDiscussionPanel({ postId, locale }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [runs, setRuns] = useState<ConversationRun[] | null>(null)
  const [personas, setPersonas] = useState<AgentPersona[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([])
  const [depth, setDepth] = useState<1 | 2 | 3>(2)
  const [dryRun, setDryRun] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewComment[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [runsRes, personasRes] = await Promise.all([
          fetch(`/api/admin/posts/${postId}/conversation-runs?locale=${locale}`),
          fetch(`/api/admin/personas?active=true`),
        ])
        if (!cancelled && runsRes.ok) {
          const data = (await runsRes.json()) as { items: ConversationRun[] }
          setRuns(data.items ?? [])
        }
        if (!cancelled && personasRes.ok) {
          const data = (await personasRes.json()) as { items: AgentPersona[] }
          setPersonas(data.items ?? [])
        }
      } catch {
        // Best-effort load — empty states render below.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [postId, locale])

  function togglePersona(id: string) {
    setSelectedPersonas((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    )
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setPreview(null)

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/posts/${postId}/generate-conversation`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              locale,
              personaIds: selectedPersonas.length > 0 ? selectedPersonas : undefined,
              depth,
              dryRun,
            }),
          },
        )
        const data = (await res.json().catch(() => null)) as GenerateResponse | null
        if (!res.ok) {
          setError(fmtError(data?.error ?? `HTTP ${res.status}`, data?.fields))
          return
        }
        if (dryRun) {
          setPreview(data?.preview ?? [])
          setSuccess(null)
        } else {
          const n = data?.commentIds?.length ?? 0
          setSuccess(`Generated ${n} comment${n === 1 ? '' : 's'}.`)
          // Reload runs list inline so the latest-run row updates.
          fetch(`/api/admin/posts/${postId}/conversation-runs?locale=${locale}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              const data = d as { items: ConversationRun[] } | null
              if (data) setRuns(data.items ?? [])
            })
            .catch(() => {})
          router.refresh()
        }
      } catch (err) {
        setError(String(err))
      }
    })
  }

  const latest = runs && runs.length > 0 ? runs[0] : null

  return (
    <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">AI Discussion</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Generate seed comments from AI personas. Disclosed with 🤖 badge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((s) => !s)
            setError(null)
            setSuccess(null)
            setPreview(null)
          }}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          {showForm ? 'Cancel' : 'Generate'}
        </button>
      </header>

      {/* Latest run row */}
      <div className="mb-4">
        {runs === null ? (
          <p className="text-xs text-zinc-500">Loading latest run…</p>
        ) : latest ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <StatusPill status={latest.status} />
            <span>
              <strong>{latest.personaIds.length}</strong> persona
              {latest.personaIds.length === 1 ? '' : 's'}
            </span>
            <span>
              <strong>{latest.commentIds.length}</strong> comment
              {latest.commentIds.length === 1 ? '' : 's'}
            </span>
            {latest.model && (
              <span className="font-mono text-[11px] text-zinc-500">{latest.model}</span>
            )}
            <span className="ml-auto text-zinc-500">{relativeTime(latest.createdAt)}</span>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
            No conversation runs yet for this article and locale.
          </p>
        )}
      </div>

      {/* Generate form */}
      {showForm && (
        <form
          onSubmit={handleGenerate}
          className="mb-4 space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4"
        >
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Personas
            </p>
            {personas === null ? (
              <p className="text-xs text-zinc-500">Loading personas…</p>
            ) : personas.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No active personas. Create one in <span className="font-mono">/personas</span>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {personas.map((p) => {
                  const active = selectedPersonas.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        active
                          ? 'border-violet-300 bg-violet-100 text-violet-900'
                          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={active}
                        onChange={() => togglePersona(p.id)}
                      />
                      <span>{p.displayName}</span>
                    </label>
                  )
                })}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Leave empty to let the server auto-select by topic match.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Depth
              </p>
              <div className="flex gap-3 text-sm">
                {DEPTHS.map((d) => (
                  <label key={d} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="depth"
                      value={d}
                      checked={depth === d}
                      onChange={() => setDepth(d)}
                    />
                    <span>{d}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-zinc-300"
              />
              <span>Dry run (preview only)</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? '…' : dryRun ? 'Preview' : 'Generate'}
            </button>
            {success && (
              <span className="text-xs text-emerald-700">{success}</span>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {error}
            </p>
          )}
        </form>
      )}

      {/* Dry-run preview */}
      {preview && preview.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Preview
          </p>
          <ul className="space-y-2">
            {preview.map((c, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 bg-white p-3 text-sm"
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-zinc-600">
                  <span className="font-semibold text-zinc-900">
                    {c.personaName ?? c.personaId}
                  </span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-800">
                    🤖 AI
                  </span>
                  {c.replyTo && (
                    <span className="text-zinc-500">↳ reply</span>
                  )}
                </div>
                <p className="whitespace-pre-line text-zinc-800">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview && preview.length === 0 && (
        <p className="mb-4 rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
          Dry run produced no comments.
        </p>
      )}

      {/* History */}
      <div>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="text-xs font-semibold text-zinc-700 hover:text-zinc-900"
        >
          {showHistory ? '▾' : '▸'} History
          {runs && runs.length > 0 && (
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
              {runs.length}
            </span>
          )}
        </button>

        {showHistory && (
          <ul className="mt-3 space-y-2">
            {runs && runs.length > 0 ? (
              runs.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-zinc-200 bg-white p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={r.status} />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      {r.triggeredBy}
                    </span>
                    <span>
                      {r.personaIds.length} persona{r.personaIds.length === 1 ? '' : 's'}
                    </span>
                    <span>
                      {r.commentIds.length} comment{r.commentIds.length === 1 ? '' : 's'}
                    </span>
                    {r.retries > 0 && (
                      <span className="text-zinc-500">retries: {r.retries}</span>
                    )}
                    <span className="ml-auto text-zinc-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {r.status === 'failed' && r.error && (
                    <p className="mt-2 whitespace-pre-line rounded bg-red-50 px-2 py-1 text-red-700">
                      {r.error}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <li className="rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
                No history.
              </li>
            )}
          </ul>
        )}
      </div>

      <p className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
        Conversations also auto-generate on publish if enabled.
      </p>
    </section>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'completed'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'failed'
        ? 'bg-red-100 text-red-800'
        : 'bg-blue-100 text-blue-800'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  )
}

function relativeTime(ts: Date | string | number): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const diff = Date.now() - d.getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return d.toLocaleDateString()
}

function fmtError(error: string, fields?: Array<{ field: string; message: string }>): string {
  if (!fields?.length) return error
  return [error, ...fields.map((f) => `  ${f.field}: ${f.message}`)].join('\n')
}
