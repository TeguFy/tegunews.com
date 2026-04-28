/**
 * Synchronous outbound webhook delivery.
 *
 * `emitEvent(db, event, payload)` finds active subscriptions matching the
 * event and POSTs to each URL with an HMAC signature header. Failures are
 * recorded on the row but don't throw — fire-and-forget by contract.
 *
 * Synchronous == bad for very slow receivers; the call adds whatever latency
 * the receiver takes. Mitigation today: 5-second per-receiver timeout. For
 * durability + retries, swap this for a Workers Queues producer; the
 * subscription table stays the same.
 */
import type { Database } from '@teguns/db'
import { webhookSubscriptions } from '@teguns/db'
import { eq } from 'drizzle-orm'

const DELIVERY_TIMEOUT_MS = 5000

export interface WebhookEvent<T = unknown> {
  /** Dotted name. e.g. 'post.publish', 'comment.approve'. */
  event: string
  /** Stable, JSON-serialisable payload. Receivers branch on `event`. */
  payload: T
  /** Optional run id propagated from `X-Agent-Run-Id` for traceability. */
  runId?: string
}

export async function emitEvent<T>(
  db: Database,
  evt: WebhookEvent<T>,
): Promise<void> {
  const subs = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.active, true))

  const matching = subs.filter((s) => s.events.includes(evt.event))
  if (matching.length === 0) return

  const body = JSON.stringify({
    event: evt.event,
    payload: evt.payload,
    runId: evt.runId,
    occurredAt: new Date().toISOString(),
  })

  // Run all deliveries in parallel — they're independent. Catch each one
  // separately so a single 500 from one receiver doesn't abort the others.
  await Promise.allSettled(
    matching.map((sub) => deliver(db, sub, body)),
  )
}

async function deliver(
  db: Database,
  sub: typeof webhookSubscriptions.$inferSelect,
  body: string,
): Promise<void> {
  const sig = await sign(body, sub.secret)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS)

  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tegunews-Signature': `sha256=${sig}`,
        'X-Tegunews-Webhook-Id': sub.id,
        'User-Agent': 'tegunews-webhook/1.0',
      },
      body,
      signal: ctrl.signal,
    })

    if (res.ok) {
      await db
        .update(webhookSubscriptions)
        .set({ lastDeliveryAt: new Date(), lastFailureStatus: null })
        .where(eq(webhookSubscriptions.id, sub.id))
    } else {
      await db
        .update(webhookSubscriptions)
        .set({ lastFailureStatus: res.status })
        .where(eq(webhookSubscriptions.id, sub.id))
    }
  } catch {
    // Network error / timeout — record as 0 so callers can distinguish from
    // an HTTP-level failure.
    await db
      .update(webhookSubscriptions)
      .set({ lastFailureStatus: 0 })
      .where(eq(webhookSubscriptions.id, sub.id))
  } finally {
    clearTimeout(t)
  }
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
