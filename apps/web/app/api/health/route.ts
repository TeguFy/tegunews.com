/**
 * Health endpoint — agents call this before bulk ops to confirm the worker
 * is up, the D1 binding is reachable, and the cache namespace is bound.
 *
 * Returns 200 with structured status. Never 5xx — agents differentiate
 * partial outages by checking individual fields, not by HTTP status.
 *
 * No auth: this endpoint must answer regardless of session/key state so
 * monitoring/agents can use it without bootstrapping credentials first.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {
    db: { ok: false },
    cache: { ok: false },
    media: { ok: false },
  }

  try {
    const { env } = await getCloudflareContext({ async: true })

    // D1 — cheap probe, doesn't read app tables.
    const t0 = performance.now()
    try {
      await env.DB.prepare('SELECT 1').first()
      checks.db = { ok: true, latencyMs: Math.round(performance.now() - t0) }
    } catch (err) {
      checks.db = { ok: false, error: String(err) }
    }

    // KV — `get` of a non-existent key still validates the binding.
    try {
      await env.CACHE?.get('__health__')
      checks.cache = { ok: Boolean(env.CACHE) }
    } catch (err) {
      checks.cache = { ok: false, error: String(err) }
    }

    // R2 — head() on a non-existent key returns null cleanly.
    try {
      await env.MEDIA?.head('__health__')
      checks.media = { ok: Boolean(env.MEDIA) }
    } catch (err) {
      checks.media = { ok: false, error: String(err) }
    }
  } catch (err) {
    return Response.json(
      { ok: false, version: process.env.NEXT_PUBLIC_APP_URL, error: String(err), checks },
      { status: 200 },
    )
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  return Response.json(
    {
      ok: allOk,
      service: 'tegunews-web',
      time: new Date().toISOString(),
      checks,
    },
    { status: 200 },
  )
}
