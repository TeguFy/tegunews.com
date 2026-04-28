/**
 * Outbound webhook subscriptions.
 *
 * Each row is a URL the system POSTs to when one of the subscribed events
 * fires. Currently delivered synchronously inside the request handler that
 * triggered the event — fast and simple, but not durable: if the receiver is
 * slow or down, the original mutation latency suffers, and a failed delivery
 * is dropped (no retry).
 *
 * Production hardening (deferred) — back this with Cloudflare Workers Queues
 * so deliveries are async + retried. Until then, treat webhooks as
 * "best-effort fanout for low-criticality consumers": agent dashboards,
 * downstream RSS rebuilders, etc. Don't use for billing or compliance flows.
 *
 * Signature: each delivery carries `X-Tegunews-Signature: sha256=<hex>` where
 * the body bytes are HMAC'd with the row's `secret`. Receivers verify before
 * trusting payload. We never send the secret in plaintext after the row is
 * created (the agent who registered the webhook keeps it).
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const webhookSubscriptions = sqliteTable(
  'webhook_subscriptions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    url: text('url').notNull(),
    /** JSON array of event names. e.g. ['post.publish', 'comment.approve']. */
    events: text('events', { mode: 'json' }).$type<string[]>().notNull(),
    /** HMAC-SHA256 secret. Hex-encoded random bytes, 32 chars. */
    secret: text('secret').notNull(),
    /** Optional human label. */
    description: text('description'),
    /** When false, the row is kept (audit) but no deliveries fire. */
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /** Timestamp of the most recent successful 2xx delivery; NULL if never. */
    lastDeliveryAt: integer('last_delivery_at', { mode: 'timestamp' }),
    /** Last non-2xx response code, for debugging. */
    lastFailureStatus: integer('last_failure_status'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    activeIdx: index('webhooks_active_idx').on(t.active),
  }),
)

export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert
