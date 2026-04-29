'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

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

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

export async function createCategoryAction(input: {
  slug: string
  name: string
  description?: string
}): Promise<Result> {
  const res = await call('POST', '/api/admin/categories', input)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? `HTTP ${res.status}` }
  }
  revalidatePath('/taxonomy')
  return { ok: true, data: await res.json() }
}

export async function createTagAction(input: {
  slug: string
  name: string
  description?: string
}): Promise<Result> {
  const res = await call('POST', '/api/admin/tags', input)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? `HTTP ${res.status}` }
  }
  revalidatePath('/taxonomy')
  return { ok: true, data: await res.json() }
}
