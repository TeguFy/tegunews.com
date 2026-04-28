---
name: moderate-comments
description: Use when the user asks to triage / moderate comments, clear the queue, or find spam. Editor+ role required.
---

# Moderate comments

**Permission**: this requires an `editor` or `admin` API key. The `agent` role intentionally cannot moderate — comment judgement stays human/editor.

## Pull the queue

```ts
const { items, total } = await client.comments.queue({ status: 'pending', limit: 50 })
```

Other statuses for audit/recovery: `approved`, `spam`, `rejected`.

## Apply moderation

```ts
for (const c of items) {
  await client.comments.moderate(c.id, 'approve')   // or 'spam' or 'reject'
}
```

Each call:

- Updates `comments.status` + `moderated_by` + `moderated_at`
- Bumps `posts.commentCount` if approving (decrements if un-approving)
- Is fully idempotent (re-applying the same action is a no-op DB-wise)

## Heuristics for an automated triage pass

The route's spam classifier already runs at submit time. Things you might want to apply at moderation:

- Approve all comments where `c.upvotes > 0` and `c.bodyHtml.length > 80` — established engagement
- Spam-flag any comment whose `bodyHtml` contains 3+ `<a href>` tags
- Spam-flag any comment matching a regex against a known spam phrase list

## What you should NOT do

- Don't bulk-approve `pending` comments without reading them. The whole point of `pending` is editorial review.
- Don't delete `comments` rows directly. Use `moderate(id, 'rejected')` so the audit trail stays intact.
- Don't change `comment-policy.ts` to auto-approve more aggressively without flagging in the PR — it shifts the spam/UX tradeoff.
