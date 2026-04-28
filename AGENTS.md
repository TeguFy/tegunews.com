# AGENTS.md

This codebase is operated primarily by AI agents. Agents both **maintain the code** and **write/moderate content at runtime**. The structure, contracts, and tooling are designed for that.

If you are an agent: start here. The system prompt for the project is in `CLAUDE.md`; this file is the behavioural contract.

---

## Design principles

| Principle                                  | What it means in practice                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slugs are the natural key, not UUIDs**   | Agents operate on `(locale, slug)` pairs. UUIDs exist but are an internal detail. The `PUT /api/admin/posts/by-slug/{locale}/{slug}` endpoint is the canonical content-write path.                                              |
| **Idempotent by default**                  | Re-running the same call must be safe. `PUT by-slug` upserts; `POST /publish` is a no-op if already published; comment moderation can be re-applied.                                                                            |
| **Stable error codes**                     | API errors return `{ error: '<snake_case_code>', fields?: [...] }`. Agents branch on `.error`, never on the human message. The SDK throws `AgentSdkError` with `.code`.                                                          |
| **Typed end-to-end**                       | `@teguns/db` types flow into `@teguns/api` (zod-openapi) into `@teguns/agent-sdk` (typed methods). Agents that consume the SDK get autocomplete + compile-time guarantees.                                                       |
| **Discoverable**                           | Every API endpoint is in the OpenAPI doc at `/api/admin/openapi.json` with a Swagger UI at `/api/admin/docs`. No tribal knowledge required.                                                                                     |
| **Audit by default**                       | Every state change goes through routes that write to `audit_log`. Agents debugging another agent's actions read this table, not git history.                                                                                   |
| **Health before bulk**                     | Agents call `GET /api/health` before bulk operations. The endpoint returns 200 always; structured fields show partial outages.                                                                                                  |
| **Editorial guardrails**                   | Agents have role `agent` (peer of `author` for content). They cannot moderate comments, cannot manage users, cannot change settings. Comment moderation stays human.                                                            |
| **Scope-narrow API keys**                  | Each key carries `scopes` (e.g. `posts:write`, `comments:moderate`). Routes enforce scope on top of role — leaked `posts:write` key cannot moderate comments even if the role allowed it.                                       |

## Authentication

Agents use API keys, not sessions. Mint a key:

```bash
pnpm tsx scripts/agents/create.ts \
  --name "Wire Service Importer" \
  --email "wire-importer@agents.tegunews.com" \
  --scopes "posts:write,comments:read" \
  --expires-in-days 90
```

The script prints the key once. Capture it; only the bcrypt hash is stored.

Pass the key as `Authorization: Bearer <key>` or `x-api-key: <key>`.

Rotate by minting a new key + setting `revokedAt` on the old one (no UI yet — `UPDATE api_keys SET revoked_at = unixepoch() WHERE id = ?`).

## SDK

```ts
import { createNewsClient } from '@teguns/agent-sdk'

const client = createNewsClient({
  baseUrl: 'https://admin.tegunews.com',
  apiKey: process.env.TEGUNEWS_API_KEY!,
})

// Idempotent — re-run safely
const post = await client.posts.upsert({
  locale: 'en',
  slug: 'wire-2026-04-27-flood-warning',  // your stable identifier
  title: 'Flood warning issued for central provinces',
  content: '<p>...</p>',
  seoTitle: 'Flood warning — central provinces, April 2026',
  seoDesc: 'Authorities issued a level-2 flood alert for...',
  focusKeyword: 'flood warning',
  categoryId: '...',
  featuredImage: 'https://...',
  featuredImageAlt: '...',
})

// Publish if SEO gate passes
try {
  await client.posts.publish(post.id)
} catch (err) {
  if (err.code === 'seo_gate_failed') {
    // err.fields has [{field, message}] — fix and retry
  }
}
```

## Stable error contract

All admin API responses follow this shape on error:

```ts
{ error: 'snake_case_code', fields?: [{ field: 'name', message: '…' }] }
```

Common codes the SDK and agent code should branch on:

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing or invalid auth |
| `forbidden` | 403 | Authenticated but lacks role/scope |
| `not_found` | 404 | Resource doesn't exist |
| `seo_gate_failed` | 422 | Publish refused by SEO validators; `fields` says why |
| `slug_taken` | 409 | Trying to create with a slug that already exists in another locale group |
| `version_mismatch` | 409 | `If-Match` header didn't equal the current row's version — re-fetch + retry |
| `comments_closed` | 403 | Article has comments disabled |
| `depth_exceeded` | 403 | Reply nesting deeper than `MAX_COMMENT_DEPTH` |

Errors never use the message text as a contract. Always branch on `error` (or SDK's `err.code`).

## Common operations cookbook

### Importing a wire-service article (idempotent)

```ts
const post = await client.posts.upsert({
  locale: 'en',
  slug: 'wire-' + wireId,    // wire ID is stable across retries
  title: wire.headline,
  content: wire.body,
  excerpt: wire.lede,
  seoTitle: wire.headline.slice(0, 70),
  seoDesc: wire.lede.slice(0, 160),
  focusKeyword: wire.primaryTopic,
  featuredImage: wire.imageUrl,
  featuredImageAlt: wire.imageCaption,
  categoryId: categoryIdForTopic(wire.topic),
})
await client.posts.publish(post.id)
```

### Translating an existing article

```ts
const en = await client.posts.getBySlug('en', 'flood-warning-april-2026')
await client.posts.upsert({
  locale: 'vi',
  slug: 'canh-bao-lu-thang-4-2026',
  title: viTitle,
  content: viContent,
  // ... translated fields
})
// The post id is shared across locales; the second upsert just adds a new
// translation row.
```

### Moderating a comment batch (editor+ role only — not agent role)

```ts
const queue = await client.comments.queue({ status: 'pending', limit: 50 })
for (const c of queue.items) {
  if (looksLikeSpam(c.bodyHtml)) {
    await client.comments.moderate(c.id, 'spam')
  }
}
```

This requires an `editor`+ key, not an `agent` key. Agent role intentionally cannot moderate.

## File layout for agents editing code

```text
apps/web/                  Public site (RSC + middleware)
apps/admin/                CMS + API surface (admin.tegunews.com)
packages/db/               Drizzle schema — single source of truth for shapes
packages/auth/             Better Auth wiring + RBAC + API keys
packages/api/              Hono routes mounted in admin
  comment-policy.ts        Spam / pending classifier — tune here
  routes/posts.ts          CRUD + publish + slug-keyed upsert
  routes/comments.ts       Public submit + admin moderation queue
packages/seo/              JSON-LD generators + publish-gate validators
packages/agent-sdk/        Typed client (this codebase's outward API)
packages/ui/               cn() util + design tokens
scripts/agents/create.ts   Provisioning script
```

### When adding a new field to a content type

The order matters. Follow it strictly:

1. `packages/db/src/schema/<table>.ts` — declare the column with index if hot-path
2. `pnpm --filter @teguns/db generate` — emit migration
3. Apply local: `pnpm --filter @teguns/db migrate:local`
4. `packages/api/src/routes/<resource>.ts` — extend the zod schema for the field
5. `packages/agent-sdk/src/index.ts` — extend the SDK input types
6. `packages/seo/` only if the field affects SEO scoring or JSON-LD
7. `apps/admin/components/post-editor.tsx` — add the input UI
8. `apps/web/...` — only if the field is reader-visible

Skipping the SDK update is the most common mistake. Other agents use the SDK; their type-checks fail when types and routes drift.

### When adding a new route

1. Define zod schemas at the top of the file (input + output + error).
2. Use `createRoute({ ... })` so OpenAPI is generated automatically.
3. Set `security: [{ BearerAuth: [] }, { ApiKey: [] }]` for any auth'd route.
4. Use `requireRole(ROLES.X)` for RBAC — never check role manually inside the handler.
5. Errors return `c.json({ error: 'snake_case', ... }, statusCode)`. Stable codes only.
6. Add the method to `packages/agent-sdk/src/index.ts` in the same PR.

## Health, observability

- `GET /api/health` — DB / KV / R2 reachability. Always 200; check `.ok`.
- `wrangler tail tegunews-web` / `wrangler tail tegunews-admin` — live logs.
- `audit_log` D1 table — every state change. Query it before suspecting "is this a bug or did another agent do it":

  ```sql
  SELECT created_at, user_id, action, resource_id FROM audit_log
  WHERE resource_id = ? ORDER BY created_at DESC LIMIT 20
  ```

## Capability matrix

| Capability                  | Status | Where                                                                |
| --------------------------- | ------ | -------------------------------------------------------------------- |
| Slug-keyed idempotent upsert | ✅    | `PUT /api/admin/posts/by-slug/{locale}/{slug}`                       |
| Health probe                | ✅     | `GET /api/health`                                                    |
| OpenAPI + Swagger UI        | ✅     | `/api/admin/openapi.json`, `/api/admin/docs`                         |
| Stable error codes          | ✅     | `{ error, fields? }` everywhere                                      |
| Audit log (write path)      | ✅     | Every mutation calls `audit(c, 'verb', id, metadata)`                |
| Run-id propagation          | ✅     | `X-Agent-Run-Id` request header → `audit_log.metadata.runId`         |
| Typed SDK                   | ✅     | `@teguns/agent-sdk`                                                  |
| API-key role + scopes       | ✅     | `requireScope('posts:write')` etc.                                   |
| API-key revocation          | ✅     | `pnpm tsx scripts/agents/revoke.ts --name "..."`                     |
| Source attribution          | ✅     | `posts.originalSourceUrl`, `originalSourceName`, `bylineDisclosure`  |
| Corrections (append-only)   | ✅     | `POST /api/admin/posts/{id}/corrections`                             |
| Scheduled publish           | ✅     | `POST /publish?at=<ISO>` + `apps/cron/` worker promotes every minute |
| Dry-run mode                | ✅     | `?dry_run=1` on upsert + publish                                     |
| Optimistic lock             | ✅     | `If-Match: <version>` header on `PATCH /posts/{id}` → 409 on race    |
| AI/scraper edge filter      | ✅     | `apps/web/middleware.ts`                                             |
| View counter                | ✅     | `posts.viewCount` + `POST /api/track/view` (fire-and-forget)         |
| Trending endpoint           | ✅     | `GET /api/admin/posts/trending` — engagement × recency               |
| Bulk upsert helper          | ✅     | `client.posts.upsertMany(inputs, { concurrency: 4 })`                |
| Media upload helper         | ✅     | `client.media.upload({ body, mimeType, altText })`                   |
| Outbound webhook firehose   | ✅     | `webhook_subscriptions` + sync HMAC-signed POST on publish/approve   |
| SDK retry-with-jitter       | ✅     | `createNewsClient({ retry: { attempts: 3 } })` — full-jitter backoff |
| Idempotency-Key replay      | ✅     | KV-cached 2xx response keyed by `userId:key`; `X-Idempotent-Replay: true` on hit |
| Diff-before-write           | ✅     | `diffPostUpsert(client, input)` — fetches current, returns delta     |
| CI pipeline                 | ✅     | `.github/workflows/ci.yml` — type-check + test + schema drift check  |

## Backlog (deferred, with workarounds)

| Gap                          | Why deferred                                                                   | Workaround                                          |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| **Durable webhook delivery** | Needs Workers Queues binding; sync ships acceptable for low-criticality fanout | Subscribers idempotent; replay from `audit_log`     |
| **API-key revocation UI**    | CLI script handles it; UI is polish                                            | `pnpm tsx scripts/agents/revoke.ts --name "..."`    |
| **Soft-paywall**             | No abuse signal yet                                                            | Tighten `RATE_LIMITER` if needed                    |

## Scope catalog

Scopes are case-sensitive. Wildcard `prefix:*` matches any same-prefix scope.

| Scope                  | Grants                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `posts:write`          | Create / update / publish / unpublish / delete posts + translations |
| `comments:moderate`    | Approve / spam / reject comments. Read the moderation queue.     |
| `corrections:write`    | Append corrections (editor+ role still required)                 |
| `webhooks:write`       | Register / delete outbound webhook subscriptions (admin role)    |
| `taxonomy:write`       | Create / update / delete categories + tags (not yet enforced)    |
| `media:write`          | Upload / delete media (not yet enforced)                         |
| `admin:*`              | Wildcard for internal-admin agents                               |

When minting an agent key, grant the **narrowest** set that lets it do its job. The "wire-importer" agent only needs `posts:write` — it doesn't need to moderate comments, even if its role would allow it.
