/**
 * Idempotency-Key middleware.
 *
 * Caches the response (status + body) for state-changing requests under
 * `idem:<userId>:<key>` in KV with a 24h TTL. A duplicate call with the
 * same key + same userId replays the cached response with
 * `X-Idempotent-Replay: true`.
 *
 * Why this exists alongside slug-keyed upsert:
 *   - Slug-keyed routes are naturally idempotent — running them twice writes
 *     the same row twice, no harm. But the second response carries fresh
 *     timestamps + a bumped `version`. Agents that auto-retry on 5xx without
 *     idempotency keys can race with their own retry, get inconsistent state.
 *   - Non-slug routes (publish, moderate) are not naturally idempotent in the
 *     subtle ways that matter: a moderation race could double-bump
 *     `commentCount`. Idempotency-Key gives an explicit dedupe slot.
 *
 * Scope: applied per-user. Two different agents using the same idempotency
 * key see different cached responses — they won't accidentally replay each
 * other's work.
 *
 * Failures (5xx, validation errors) are NOT cached. Only 2xx is cached so
 * agents can retry after a transient error and get a fresh execution.
 */
import type { MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../app'

const TTL_SECONDS = 86400  // 24h

interface CachedResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export const idempotencyMiddleware: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const key = c.req.header('idempotency-key')
  if (!key) return next()

  // Mutation-only — GET/HEAD pass through. Reading the same resource twice
  // is naturally idempotent and doesn't need a cache slot.
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()

  // Per-user namespace so two different agents using the same idempotency
  // string don't collide.
  const userId = c.var.userId ?? 'anon'
  const cacheKey = `idem:${userId}:${key}`

  const kv = c.env.CACHE
  if (!kv) return next()  // KV not bound (dev) — silently fall through

  const cached = await kv.get(cacheKey)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as CachedResponse
      const headers = new Headers(parsed.headers)
      headers.set('X-Idempotent-Replay', 'true')
      return new Response(parsed.body, { status: parsed.status, headers })
    } catch {
      // Corrupt cache — fall through to fresh execution.
    }
  }

  await next()

  // Only cache 2xx. Errors should be retryable on a fresh execution.
  const status = c.res.status
  if (status >= 200 && status < 300) {
    const body = await c.res.clone().text()
    const headers: Record<string, string> = {}
    c.res.headers.forEach((v, k) => { headers[k] = v })
    const payload: CachedResponse = { status, body, headers }
    // Fire-and-forget the KV write — caller already has the response in flight.
    c.executionCtx.waitUntil(
      kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: TTL_SECONDS }),
    )
  }
}
