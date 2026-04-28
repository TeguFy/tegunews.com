/**
 * Typed client for non-human callers (newsroom agents, importers, scheduled
 * Workers cron tasks). Wraps the @teguns/api admin endpoints.
 *
 * Design notes:
 *
 *   - Auth is API-key only. Agents never get sessions; they get keys minted
 *     by `scripts/agents/create.ts`.
 *   - Methods that target content prefer slug-keyed paths over UUID. Slugs
 *     are stable and idempotent: an agent re-running its job won't double-
 *     create rows.
 *   - Errors throw `AgentSdkError` with a stable `.code` field. Agents
 *     branch on the code, not the human message.
 *   - No retry logic baked in — that's a per-caller policy. Callers using
 *     Cloudflare Workflows or Durable Objects already have retry semantics.
 */

export interface RetryConfig {
  /** Max total attempts including the first. Default: 1 (no retry). */
  attempts?: number
  /** Base delay for exponential backoff, in ms. Default: 200. */
  baseDelayMs?: number
  /** Max delay cap, in ms. Default: 5000. */
  maxDelayMs?: number
  /**
   * Status codes that should trigger a retry. Default: [408, 425, 429, 500,
   * 502, 503, 504]. Network errors (no response) always retry.
   *
   * 4xx other than 408/425/429 are NOT retried — they indicate a client
   * problem the next attempt can't fix.
   */
  retryStatuses?: number[]
}

export interface ClientOptions {
  baseUrl: string
  apiKey: string
  /** Default fetch — override for tests / custom transports. */
  fetcher?: typeof fetch
  /** Opt-in retry. Off by default; Workflows callers already have retries. */
  retry?: RetryConfig
}

export class AgentSdkError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly fields?: Array<{ field: string; message: string }>,
  ) {
    super(message)
    this.name = 'AgentSdkError'
  }
}

interface Post {
  id: string
  status: 'draft' | 'published' | 'scheduled'
  featuredImage: string | null
  featuredImageAlt: string | null
  featuredImageCredit: string | null
  authorId: string
  authorName: string | null
  categoryId: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  featured: boolean
  breakingUntil: string | null
  commentsEnabled: boolean
  commentCount: number
  readingTime: number | null
  internalLinksCount: number
  externalLinksCount: number
}

interface Comment {
  id: string
  postId: string
  parentId: string | null
  authorName: string
  bodyHtml: string
  status: 'pending' | 'approved' | 'spam' | 'rejected'
  upvotes: number
  createdAt: string
}

export interface UpsertPostInput {
  locale: string
  slug: string
  title: string
  content: string
  excerpt?: string | null
  seoTitle?: string | null
  seoDesc?: string | null
  focusKeyword?: string | null
  relatedKeywords?: string[] | null
  featuredImage?: string | null
  featuredImageAlt?: string | null
  featuredImageCredit?: string | null
  categoryId?: string | null
  featured?: boolean
  breakingUntil?: string | null
  commentsEnabled?: boolean
  /** Required for wire-service / syndicated content. */
  originalSourceUrl?: string | null
  originalSourceName?: string | null
  bylineDisclosure?: 'AI-assisted' | 'AI-generated' | 'wire' | 'staff' | null
}

export interface PublishOpts {
  locale?: string
  /** ISO timestamp for scheduled publish. Past timestamps publish immediately. */
  at?: string
  /** Validate without writing. Returns the would-be Post. */
  dryRun?: boolean
}

interface Correction {
  id: string
  postId: string
  locale: string
  note: string
  issuedBy: string | null
  repushedAt: string | null
  createdAt: string
}

export function createNewsClient(opts: ClientOptions) {
  const { baseUrl, apiKey } = opts
  const f = opts.fetcher ?? fetch

  // Retry config — defaults are conservative. The retry path also propagates
  // an `Idempotency-Key` header on the second+ attempt (auto-generated UUID)
  // so non-idempotent endpoints don't double-execute on the server side.
  const retryAttempts = Math.max(1, opts.retry?.attempts ?? 1)
  const retryBaseMs = opts.retry?.baseDelayMs ?? 200
  const retryMaxMs = opts.retry?.maxDelayMs ?? 5000
  const retryStatuses = new Set(opts.retry?.retryStatuses ?? [408, 425, 429, 500, 502, 503, 504])

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    // Stable idempotency key for the lifetime of this call's retries — only
    // sent if multiple attempts will be tried, so single-attempt calls don't
    // burn a server-side dedupe slot.
    const idemKey = retryAttempts > 1 ? crypto.randomUUID() : undefined

    let lastErr: unknown
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const res = await f(`${baseUrl}${path}`, {
          method,
          headers: {
            'x-api-key': apiKey,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(idemKey ? { 'Idempotency-Key': idemKey } : {}),
            ...(extraHeaders ?? {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
            fields?: Array<{ field: string; message: string }>
          }
          const err = new AgentSdkError(
            data.error ?? `HTTP ${res.status}`,
            res.status,
            data.error ?? 'unknown',
            data.fields,
          )
          // Retry only on configured statuses; let 4xx "your request is bad"
          // errors fail fast.
          if (attempt < retryAttempts && retryStatuses.has(res.status)) {
            await sleep(jitterBackoff(attempt, retryBaseMs, retryMaxMs))
            lastErr = err
            continue
          }
          throw err
        }

        if (res.status === 204) return undefined as T
        return (await res.json()) as T
      } catch (err) {
        // Network-level error (DNS, abort, TLS). Always retry-eligible if
        // attempts remain.
        if (err instanceof AgentSdkError) throw err
        if (attempt < retryAttempts) {
          await sleep(jitterBackoff(attempt, retryBaseMs, retryMaxMs))
          lastErr = err
          continue
        }
        throw err
      }
    }
    throw lastErr
  }

  return {
    /** Health probe — always returns 200; check `.ok`. */
    health(): Promise<{ ok: boolean; checks: Record<string, { ok: boolean }> }> {
      return request('GET', '/api/health')
    },

    posts: {
      /** Idempotent upsert by (locale, slug). 200 if updated, 201 if created. */
      async upsert(input: UpsertPostInput, opts?: { dryRun?: boolean }): Promise<Post> {
        const { locale, slug, ...body } = input
        const q = opts?.dryRun ? '?dry_run=1' : ''
        return request<Post>('PUT', `/api/admin/posts/by-slug/${locale}/${encodeURIComponent(slug)}${q}`, body)
      },

      /** Fetch by (locale, slug). Throws AgentSdkError(404) if absent. */
      getBySlug(locale: string, slug: string): Promise<Post> {
        return request('GET', `/api/admin/posts/by-slug/${locale}/${encodeURIComponent(slug)}`)
      },

      /**
       * Publish or schedule. Defaults to immediate publish. Pass `at` to
       * schedule for a future ISO timestamp; pass `dryRun: true` to validate
       * without writing. Throws AgentSdkError with `.fields` on SEO failure.
       */
      publish(id: string, opts?: PublishOpts): Promise<Post> {
        const q = new URLSearchParams()
        q.set('locale', opts?.locale ?? 'en')
        if (opts?.at) q.set('at', opts.at)
        if (opts?.dryRun) q.set('dry_run', '1')
        return request('POST', `/api/admin/posts/${id}/publish?${q}`)
      },

      unpublish(id: string): Promise<Post> {
        return request('POST', `/api/admin/posts/${id}/unpublish`)
      },

      delete(id: string): Promise<void> {
        return request('DELETE', `/api/admin/posts/${id}`)
      },

      list(opts?: { status?: 'draft' | 'published' | 'scheduled'; limit?: number; offset?: number }): Promise<{ items: Post[]; total: number }> {
        const q = new URLSearchParams()
        if (opts?.status) q.set('status', opts.status)
        if (opts?.limit) q.set('limit', String(opts.limit))
        if (opts?.offset) q.set('offset', String(opts.offset))
        return request('GET', `/api/admin/posts?${q}`)
      },

      /**
       * Trending posts for a given locale + window. Score is
       * (views * vw + comments * cw) * linear-recency. Use as the input to
       * "what should I feature now?" decisions.
       */
      trending(opts?: { locale?: string; windowHours?: number; limit?: number }): Promise<{
        items: Array<{ id: string; title: string; slug: string; locale: string; publishedAt: string; viewCount: number; commentCount: number; hoursAgo: number; score: number }>
      }> {
        const q = new URLSearchParams()
        if (opts?.locale) q.set('locale', opts.locale)
        if (opts?.windowHours) q.set('window_hours', String(opts.windowHours))
        if (opts?.limit) q.set('limit', String(opts.limit))
        return request('GET', `/api/admin/posts/trending?${q}`)
      },

      /**
       * Bulk-upsert with concurrency control. Returns one result per input,
       * in the same order. Failed items get `ok: false` + error metadata —
       * partial success is deliberate so one bad article doesn't block the rest.
       *
       * `concurrency` defaults to 4 — amortises round-trip latency without
       * bursting D1's per-second write limit on a Free plan.
       */
      async upsertMany(
        inputs: UpsertPostInput[],
        opts?: { concurrency?: number; dryRun?: boolean },
      ): Promise<Array<
        | { ok: true; index: number; post: Post }
        | { ok: false; index: number; error: string; status: number; message: string }
      >> {
        const concurrency = Math.max(1, opts?.concurrency ?? 4)
        const results: Array<
          | { ok: true; index: number; post: Post }
          | { ok: false; index: number; error: string; status: number; message: string }
        > = new Array(inputs.length)
        let cursor = 0

        const runOne = async (input: UpsertPostInput): Promise<Post> => {
          const { locale, slug, ...body } = input
          const q = opts?.dryRun ? '?dry_run=1' : ''
          return request<Post>(
            'PUT',
            `/api/admin/posts/by-slug/${locale}/${encodeURIComponent(slug)}${q}`,
            body,
          )
        }

        async function worker() {
          while (true) {
            const i = cursor++
            if (i >= inputs.length) break
            try {
              const post = await runOne(inputs[i])
              results[i] = { ok: true, index: i, post }
            } catch (err) {
              const e = err as AgentSdkError
              results[i] = {
                ok: false,
                index: i,
                error: e.code ?? 'unknown',
                status: e.status ?? 0,
                message: e.message ?? String(err),
              }
            }
          }
        }

        await Promise.all(Array.from({ length: concurrency }, () => worker()))
        return results
      },
    },

    corrections: {
      list(postId: string, locale?: string): Promise<{ items: Correction[] }> {
        const q = locale ? `?locale=${locale}` : ''
        return request('GET', `/api/admin/posts/${postId}/corrections${q}`)
      },
      /** Append a correction. Pass `repush: true` to bump dateModified for re-indexing. */
      issue(postId: string, input: { locale: string; note: string; repush?: boolean }): Promise<Correction> {
        return request('POST', `/api/admin/posts/${postId}/corrections`, input)
      },
    },

    categories: {
      list(): Promise<{ items: Array<{ id: string; slug: string; name: string }> }> {
        return request('GET', '/api/admin/categories')
      },
      create(input: { slug: string; name: string; parentId?: string | null; description?: string | null }) {
        return request('POST', '/api/admin/categories', input)
      },
    },

    tags: {
      list(): Promise<{ items: Array<{ id: string; slug: string; name: string }> }> {
        return request('GET', '/api/admin/tags')
      },
      create(input: { slug: string; name: string }) {
        return request('POST', '/api/admin/tags', input)
      },
    },

    media: {
      /**
       * Upload an image to R2 + register the row. Accepts ArrayBuffer (e.g.
       * from `fetch(url).then(r => r.arrayBuffer())`) or a Blob/File. The
       * returned `url` is what to put into `posts.featuredImage`.
       *
       * Allowed MIME types: image/jpeg, image/png, image/webp, image/gif,
       * image/avif, image/svg+xml. Max 10 MB.
       */
      async upload(input: {
        body: ArrayBuffer | Blob
        filename: string
        mimeType: string
        altText?: string
        caption?: string
        credit?: string
      }): Promise<{ id: string; url: string; r2Key: string }> {
        const form = new FormData()
        const blob = input.body instanceof Blob
          ? input.body
          : new Blob([input.body], { type: input.mimeType })
        form.append('file', blob, input.filename)
        if (input.altText) form.append('altText', input.altText)
        if (input.caption) form.append('caption', input.caption)
        if (input.credit) form.append('credit', input.credit)
        // Cannot reuse `request()` because it sets Content-Type: application/json.
        // FormData lets the runtime set the multipart boundary header.
        const res = await f(`${baseUrl}/api/admin/media`, {
          method: 'POST',
          headers: { 'x-api-key': apiKey },
          body: form,
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new AgentSdkError(data.error ?? `HTTP ${res.status}`, res.status, data.error ?? 'unknown')
        }
        return (await res.json()) as { id: string; url: string; r2Key: string }
      },
    },

    webhooks: {
      list(): Promise<{ items: Array<{ id: string; url: string; events: string[]; active: boolean; createdAt: string }> }> {
        return request('GET', '/api/admin/webhooks')
      },
      /** Returns secret in plaintext ONCE — capture it. */
      create(input: { url: string; events: string[]; description?: string }): Promise<{ id: string; secret: string; url: string; events: string[] }> {
        return request('POST', '/api/admin/webhooks', input)
      },
      delete(id: string): Promise<void> {
        return request('DELETE', `/api/admin/webhooks/${id}`)
      },
    },

    comments: {
      /** Editor+ only. Returns the comments awaiting moderation. */
      queue(opts?: { status?: 'pending' | 'approved' | 'spam' | 'rejected'; limit?: number }): Promise<{ items: Comment[]; total: number }> {
        const q = new URLSearchParams()
        if (opts?.status) q.set('status', opts.status)
        if (opts?.limit) q.set('limit', String(opts.limit))
        return request('GET', `/api/admin/comments/queue?${q}`)
      },
      /** Editor+ only. */
      moderate(id: string, action: 'approve' | 'spam' | 'reject'): Promise<Comment> {
        return request('POST', `/api/admin/comments/${id}/moderate`, { action })
      },
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Exponential backoff with full jitter — Marc Brooker's recommendation. */
function jitterBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
  return Math.random() * exp
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Diff helper ────────────────────────────────────────────────────────────
//
// Computes a structured delta between an upsert input and the post currently
// at (locale, slug). Agents call this before write to decide:
//   - skip if nothing changed (saves a write + sitemap churn)
//   - log what's about to change (audit trail before commit)
//   - confirm with a human before sensitive edits
//
// Lives outside `createNewsClient` because it doesn't need the request helper —
// it composes `getBySlug` + a pure diff.

export interface DiffResult {
  exists: boolean
  /** Fields that would be set/changed. */
  changed: Array<{ field: string; old: unknown; new: unknown }>
  /** Fields supplied in input that match current state — no-op. */
  unchanged: string[]
}

const DIFFABLE_FIELDS = [
  'title', 'content', 'excerpt', 'seoTitle', 'seoDesc', 'focusKeyword',
  'featuredImage', 'featuredImageAlt', 'featuredImageCredit',
  'categoryId', 'featured', 'breakingUntil', 'commentsEnabled',
  'originalSourceUrl', 'originalSourceName', 'bylineDisclosure',
] as const

export async function diffPostUpsert(
  client: NewsClient,
  input: UpsertPostInput,
): Promise<DiffResult> {
  let current: Record<string, unknown> | null
  try {
    current = (await client.posts.getBySlug(input.locale, input.slug)) as unknown as Record<string, unknown>
  } catch (err) {
    if (err instanceof AgentSdkError && err.status === 404) {
      return { exists: false, changed: DIFFABLE_FIELDS.map((f) => ({ field: f, old: null, new: (input as never)[f] ?? null })), unchanged: [] }
    }
    throw err
  }

  const changed: DiffResult['changed'] = []
  const unchanged: string[] = []
  for (const f of DIFFABLE_FIELDS) {
    const desired = (input as never)[f]
    if (desired === undefined) continue   // not specified in input
    const existing = current[f] ?? null
    if (existing === desired || JSON.stringify(existing) === JSON.stringify(desired)) {
      unchanged.push(f)
    } else {
      changed.push({ field: f, old: existing, new: desired })
    }
  }
  return { exists: true, changed, unchanged }
}

export type NewsClient = ReturnType<typeof createNewsClient>
