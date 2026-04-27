'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { sessions } from '@teguns/db'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createDb } from '@teguns/db'

const SESSION_COOKIES = [
  'tegunews_session',
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
]

export async function logout() {
  const cookieStore = await cookies()

  let token: string | undefined
  for (const name of SESSION_COOKIES) {
    const v = cookieStore.get(name)?.value
    if (v) { token = v.split('.')[0]; break }
  }

  if (token) {
    try {
      const { env } = await getCloudflareContext()
      const db = createDb(env.DB)
      await db.delete(sessions).where(eq(sessions.token, token))
    } catch { /* dev fallback: cookie clear is enough */ }
  }

  for (const name of SESSION_COOKIES) cookieStore.delete(name)
  redirect('/login')
}
