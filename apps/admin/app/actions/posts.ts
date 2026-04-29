'use server'

/**
 * Server actions for the post editor.
 *
 * Implementation note: each action self-fetches the admin API on the same
 * worker instead of duplicating the upsert/publish logic. This keeps audit
 * + webhook side-effects in one place (the route handler) and means the
 * UI uses the exact same code path a third-party SDK caller would.
 *
 * Cookie forwarding: Next.js server actions don't auto-attach the request
 * cookies to outbound `fetch`. We pull them from `cookies()` and set the
 * `Cookie` header explicitly so the API's auth middleware sees the
 * session.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const SESSION_COOKIES = [
  'tegunews_session',
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
]

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://admin.tegunews.com'

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const cookieStore = await cookies()
  const cookieHeader = SESSION_COOKIES
    .map((n) => {
      const v = cookieStore.get(n)?.value
      return v ? `${n}=${v}` : null
    })
    .filter(Boolean)
    .join('; ')

  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export interface UpsertInput {
  locale: string
  slug: string
  title: string
  content: string
  excerpt?: string
  seoTitle?: string
  seoDesc?: string
  focusKeyword?: string
  featuredImage?: string
  featuredImageAlt?: string
  featuredImageCredit?: string
  categoryId?: string
  featured?: boolean
  commentsEnabled?: boolean
  originalSourceUrl?: string
  originalSourceName?: string
  bylineDisclosure?: 'AI-assisted' | 'AI-generated' | 'wire' | 'staff'
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Array<{ field: string; message: string }> }

async function jsonOrError(res: Response): Promise<ActionResult> {
  if (res.ok) return { ok: true, data: await res.json() }
  // Try to parse stable error envelope; fall back to text.
  try {
    const data = (await res.json()) as { error?: string; fields?: Array<{ field: string; message: string }> }
    return { ok: false, error: data.error ?? `HTTP ${res.status}`, fields: data.fields }
  } catch {
    return { ok: false, error: `HTTP ${res.status}` }
  }
}

export async function upsertPostAction(input: UpsertInput): Promise<ActionResult<{ id: string }>> {
  // Trim each non-required field's empty-string to null so the API's nullable
  // schema accepts it. Empty strings would fail z.url().nullable() validation.
  const body: Record<string, unknown> = { title: input.title, content: input.content }
  for (const k of [
    'excerpt', 'seoTitle', 'seoDesc', 'focusKeyword',
    'featuredImage', 'featuredImageAlt', 'featuredImageCredit',
    'categoryId', 'originalSourceUrl', 'originalSourceName', 'bylineDisclosure',
  ] as const) {
    const v = input[k]
    if (v !== undefined && v !== '') body[k] = v
  }
  if (input.featured !== undefined) body.featured = input.featured
  if (input.commentsEnabled !== undefined) body.commentsEnabled = input.commentsEnabled

  const res = await call(
    'PUT',
    `/api/admin/posts/by-slug/${encodeURIComponent(input.locale)}/${encodeURIComponent(input.slug)}`,
    body,
  )
  const result = await jsonOrError(res)
  if (result.ok) {
    revalidatePath('/posts')
    revalidatePath(`/posts/${(result.data as { id: string }).id}/edit`)
  }
  return result as ActionResult<{ id: string }>
}

export async function publishPostAction(id: string, locale = 'en', at?: string): Promise<ActionResult> {
  const q = new URLSearchParams({ locale })
  if (at) q.set('at', at)
  const res = await call('POST', `/api/admin/posts/${id}/publish?${q}`)
  const result = await jsonOrError(res)
  if (result.ok) {
    revalidatePath('/posts')
    revalidatePath(`/posts/${id}/edit`)
  }
  return result
}

export async function unpublishPostAction(id: string): Promise<ActionResult> {
  const res = await call('POST', `/api/admin/posts/${id}/unpublish`)
  const result = await jsonOrError(res)
  if (result.ok) {
    revalidatePath('/posts')
    revalidatePath(`/posts/${id}/edit`)
  }
  return result
}

export async function deletePostAction(id: string): Promise<void> {
  const res = await call('DELETE', `/api/admin/posts/${id}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Delete failed (${res.status}): ${text}`)
  }
  revalidatePath('/posts')
  redirect('/posts')
}
