---
name: subscribe-webhooks
description: Use when the user asks to receive notifications when articles publish, comments are approved, or corrections issued. Sets up an outbound webhook with HMAC verification.
---

# Subscribe to webhooks

The system POSTs JSON to your URL whenever a subscribed event fires.

## Register

```ts
const sub = await client.webhooks.create({
  url: 'https://your-receiver.example.com/tegunews-webhook',
  events: ['post.publish', 'comment.approve', 'correction.issue'],
  description: 'Slack notifier for #newsroom',
})
console.log('SAVE THIS — not retrievable later:', sub.secret)
```

## Verify the signature on every delivery

Each POST carries `X-Tegunews-Signature: sha256=<hex>` where `<hex>` is HMAC-SHA256 of the raw request body, keyed by the secret you saved.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(rawBody: string, header: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}
```

Reject the request with 401 if verification fails. Without verification, anyone who guesses your URL can spoof events.

## Body shape

```json
{
  "event": "post.publish",
  "payload": {
    "id": "<uuid>",
    "locale": "en",
    "slug": "flood-warning-april-2026",
    "title": "...",
    "publishedAt": "2026-04-28T12:00:00.000Z"
  },
  "runId": "wire-importer-2026-04-28T12",
  "occurredAt": "2026-04-28T12:00:01.234Z"
}
```

`runId` is whatever the upstream agent set in `X-Agent-Run-Id` — null when humans/cookie sessions trigger the event.

## Events

| Event              | Fires when                                              |
| ------------------ | ------------------------------------------------------- |
| `post.publish`     | A post moves to `status='published'` (immediate, not the cron-promoted variant — watch `audit_log` for `post.publish` to see those too) |
| `comment.approve`  | An editor approves a pending comment                    |
| `correction.issue` | A correction is appended (with or without `repush`)     |

## Retry semantics

Today: **none**. Delivery is sync from the API request that triggered the event; if your endpoint is down or returns non-2xx, the delivery is dropped and `webhook_subscriptions.lastFailureStatus` records the response code.

Make your handler **idempotent** (same event delivered twice = no harm) — when we wire Workers Queues, retries become real and you'll receive duplicates.

## What NOT to do

- Don't synchronously call back into the tegunews API from your handler — risk of feedback loops.
- Don't trust the body without checking the signature.
- Don't expect ordering; deliveries are in-flight parallel.
