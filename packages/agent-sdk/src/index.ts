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

export interface ClientOptions {
  baseUrl: string
  apiKey: string
  /** Default fetch — override for tests / custom transports. */
  fetcher?: typeof fetch
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
}

export function createNewsClient(opts: ClientOptions) {
  const { baseUrl, apiKey } = opts
  const f = opts.fetcher ?? fetch

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await f(`${baseUrl}${path}`, {
      method,
      headers: {
        'x-api-key': apiKey,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        fields?: Array<{ field: string; message: string }>
      }
      throw new AgentSdkError(
        data.error ?? `HTTP ${res.status}`,
        res.status,
        data.error ?? 'unknown',
        data.fields,
      )
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    /** Health probe — always returns 200; check `.ok`. */
    health(): Promise<{ ok: boolean; checks: Record<string, { ok: boolean }> }> {
      return request('GET', '/api/health')
    },

    posts: {
      /** Idempotent upsert by (locale, slug). 200 if updated, 201 if created. */
      async upsert(input: UpsertPostInput): Promise<Post> {
        const { locale, slug, ...body } = input
        return request<Post>('PUT', `/api/admin/posts/by-slug/${locale}/${encodeURIComponent(slug)}`, body)
      },

      /** Fetch by (locale, slug). Throws AgentSdkError(404) if absent. */
      getBySlug(locale: string, slug: string): Promise<Post> {
        return request('GET', `/api/admin/posts/by-slug/${locale}/${encodeURIComponent(slug)}`)
      },

      /** Publish — runs the SEO gate. Throws AgentSdkError with `.fields` on 422. */
      publish(id: string, locale = 'en'): Promise<Post> {
        return request('POST', `/api/admin/posts/${id}/publish?locale=${locale}`)
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

export type NewsClient = ReturnType<typeof createNewsClient>
