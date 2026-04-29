/**
 * Better Auth catch-all handler.
 *
 * Mounts the auth instance against `/api/auth/*` so all of Better Auth's
 * built-in endpoints (`/sign-in/email`, `/sign-up/email`, `/sign-out`,
 * `/session`, `/get-session`, `/user`, ...) become reachable.
 *
 * The cookie domain is whatever the request is on — Better Auth handles
 * that automatically given `baseURL` is set in `createAuth`.
 */
import { createAuth } from '@teguns/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

async function handler(req: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true })
  const baseURL = env.NEXT_PUBLIC_APP_URL ?? 'https://admin.tegunews.com'
  const auth = createAuth(env.DB, baseURL)
  return auth.handler(req)
}

export { handler as GET, handler as POST }
