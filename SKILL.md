---
name: tegunews
description: >
  Operational playbook for the tegunews.com codebase — a multilingual (EN/VI)
  news site on Cloudflare Workers. Use this skill when working on any task
  involving the tegunews monorepo: content operations, API changes, schema
  migrations, deploy, or debugging production issues.
---

# TeguNews Codebase Skill

## Stack at a glance

| Layer | Tech |
|---|---|
| Apps | `apps/web` (public, Next.js 16 + next-intl), `apps/admin` (CMS + API, Next.js 16 + Hono + Better Auth) |
| Packages | `@teguns/{db,auth,api,seo,ui,agent-sdk}` |
| Infra | Cloudflare D1 (SQLite), R2 (media), KV (cache), Analytics Engine |
| Deploy | `opennextjs-cloudflare` → `wrangler`, custom domains `tegunews.com` + `admin.tegunews.com` |
| Auth | Better Auth + RBAC + API keys (SHA-256 hashed, scope-limited) |

## Role hierarchy

```
commenter=1  <  agent=2 = author=2  <  editor=3  <  admin=4
```

- `agent` role: can create/publish posts, trigger AI conversations. **Cannot** moderate comments or manage users.
- `editor`+ role: required for comment moderation, unpublish, delete, corrections.
- API keys carry `scopes` on top of role — a leaked key is blast-radius-limited even if the role would allow more.

## Common ops

```bash
# Type-check
pnpm --filter @teguns/admin type-check
pnpm --filter @teguns/web type-check

# Deploy (pushes to prod — confirm before running)
pnpm --filter @teguns/admin run deploy   # build + wrangler deploy
pnpm --filter @teguns/web run deploy

# Fast deploy (skip rebuild — use only when no source changed)
pnpm --filter @teguns/admin run deploy:fast

# Live logs
wrangler tail tegunews-admin
wrangler tail tegunews-web

# D1 query (remote prod)
CLOUDFLARE_ACCOUNT_ID=ec2e566402dc149a94d3b10d211772b3 \
  npx wrangler d1 execute tegunews --remote --command="SELECT ..."
```

## Content operations (agent API)

### Mint an API key

```bash
pnpm tsx scripts/agents/create.ts \
  --name "Wire Service Importer" \
  --email "wire-importer@agents.tegunews.com" \
  --scopes "posts:write,conversations:write" \
  --expires-in-days 90
```

Pass as `x-api-key: <key>` or `Authorization: Bearer <key>`.

### Upsert + publish a post (idempotent)

`PUT /api/admin/posts/by-slug/{locale}/{slug}` is the canonical write path. Re-running is safe.

```ts
// All fields must be present on every upsert — it's a full replace of the translation row.
// Missing fields (seoTitle, focusKeyword, content) will be wiped to null/empty.
const res = await fetch(`https://admin.tegunews.com/api/admin/posts/by-slug/en/my-slug`, {
  method: 'PUT',
  headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My Article',
    content: '<p>At least 80 words of content...</p>',
    seoTitle: 'My Article — Site Name',          // required for publish, max ~60 chars
    seoDesc: 'Between 120 and 160 characters.',  // required, 120–160 chars
    focusKeyword: 'main keyword',                // required for publish
    featuredImage: 'https://...',                // required for publish
    featuredImageAlt: 'Description',
    excerpt: 'Short summary.',
    categoryId: 'uuid',
  }),
})
const post = await res.json()  // returns { id, status, ... } — no translation fields in response

// Publish (requires posts:write scope, agent/author/editor/admin role)
await fetch(`https://admin.tegunews.com/api/admin/posts/${post.id}/publish?locale=en`, {
  method: 'POST',
  headers: { 'x-api-key': KEY },
})
```

### SEO gate — publish requirements

The publish endpoint validates before writing. All must pass:

| Field | Rule |
|---|---|
| `seoTitle` | Required, non-empty |
| `seoDesc` | Required, **120–160 characters** |
| `focusKeyword` | Required, non-empty |
| `featuredImage` | Required, non-empty URL |
| `content` | Minimum **80 words** (HTML stripped) |

On failure: `{ error: 'seo_gate_failed', fields: [{ field, message }] }`. Fix each field and retry.

## SEO + GEO foundation (site-wide)

Per-post SEO is gated above; this section covers the **site-level** plumbing — metadata defaults, schemas, robots, sitemap, AI-assistant discovery. The 2026 GEO standard (Generative Engine Optimization — getting cited by ChatGPT / Perplexity / Gemini / Claude) weighs technical foundation + structured data at ~25% of total score, and every news article inherits these defaults.

### Where each piece lives

| Concern | File | Notes |
|---|---|---|
| Root metadata defaults | `apps/web/app/layout.tsx` | `metadataBase`, title template (`%s — TeguNews`), OG/Twitter defaults, robots, viewport, RSS `<link rel="alternate">` |
| Home metadata (per locale) | `apps/web/app/[locale]/page.tsx` | Uses `seo.homeTitle` / `seo.homeDescription` from `messages/{en,vi}.json` |
| Per-post metadata | `packages/seo/src/metadata/post.ts` → `generatePostMetadata()` | Builds hreflang languages map + `x-default` from `alternateTranslations` |
| `NewsArticle` JSON-LD | `packages/seo/src/schema/news-article.ts` | ImageObject w/ 1200×630 dims, `isPartOf` → WebSite, `Person` author w/ optional URL |
| `WebSite` / `NewsMediaOrganization` JSON-LD | `packages/seo/src/schema/{website,organization}.ts` | Pinned with `@id` (`#website`, `#publisher`) so schemas form a graph |
| Breadcrumb / CollectionPage | `apps/web/app/[locale]/category/[slug]/page.tsx` | Category pages emit both |
| Sitemap (with hreflang) | `apps/web/app/sitemap.ts` | Posts grouped by `postId` → each entry includes sibling-locale `alternates.languages` |
| Google News sitemap | `apps/web/app/news-sitemap.xml/route.ts` | `<news:news>` namespace, 48h window (`SEO_LIMITS.newsRecencyHours`) |
| robots.txt | `apps/web/app/robots.ts` | Explicit allow rules for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc. — auditable in Search Console |
| `/llms.txt` | `apps/web/app/llms.txt/route.ts` | AI-assistant discovery file — brand description + key URLs |
| RSS feed (EN) | `apps/web/app/feed.xml/route.ts` | Wired into root `metadata.alternates.types['application/rss+xml']` |

### Required schemas by page type

| Page | Schemas emitted |
|---|---|
| `/[locale]` (home) | `WebSite` + `NewsMediaOrganization` |
| `/[locale]/news` (listing) | `BreadcrumbList` |
| `/[locale]/news/[slug]` | `NewsArticle` + `BreadcrumbList` |
| `/[locale]/category/[slug]` | `BreadcrumbList` + `CollectionPage` (with `ItemList`) |

If you add a new page type, emit at least `BreadcrumbList` via `generateBreadcrumbSchema()` + `<JsonLd />`.

### AI bot allow-list (robots.ts)

The wildcard `*` rule technically covers them, but `AI_CRAWLERS` lists 18 UAs by name (GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, GoogleOther, CCBot, cohere-ai, Bytespider, Applebot-Extended, Meta-ExternalAgent, Diffbot, DuckAssistBot, YouBot). To opt out of one, flip its rule to `disallow: '/'` — these vendors honour robots.txt by policy.

### Sitemap hreflang behaviour

`sitemap.ts` groups all post translations by `postId` and emits one entry per locale-slug with `alternates.languages` pointing at sibling locales + `x-default` (English fallback). Adding a new locale requires updating the `LOCALES` const **and** seeding translations for existing posts — otherwise the new locale's URLs won't appear, and existing entries won't gain the new alternate.

### Monthly SEO maintenance

- Verify `apps/web/public/logo.png` exists (512×512, referenced by schemas — missing file = Search Console warning).
- Spot-check a few articles through Google Rich Results Test (`https://search.google.com/test/rich-results`).
- Re-validate `/llms.txt` after every brand / URL structure change.
- If you add a new content type, update the "Required schemas by page type" table above.

### Trigger AI conversation generation

```bash
curl -X POST \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"locale":"en"}' \
  "https://admin.tegunews.com/api/admin/posts/{id}/generate-conversation"
```

Requires `conversations:write` scope + `editor`+ role.  
Returns `{ runId, status, commentIds, skipped }`. Status `completed` = comments inserted.

## Error contract

All errors: `{ error: 'snake_case_code', fields?: [{ field, message }] }`. Branch on `.error`, never on the message string.

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing/invalid key |
| `forbidden` | 403 | Wrong role or missing scope |
| `not_found` | 404 | Resource doesn't exist |
| `seo_gate_failed` | 422 | Publish blocked; `fields` lists what to fix |
| `slug_taken` | 409 | Slug exists in another locale group |
| `version_mismatch` | 409 | Optimistic lock failed — re-fetch + retry |

## Scope catalog

| Scope | Grants |
|---|---|
| `posts:write` | Create / update / publish / unpublish / delete posts |
| `conversations:write` | Trigger AI conversation generation (editor+ role also required) |
| `comments:moderate` | Approve / spam / reject comments (editor+ role also required) |
| `personas:write` | CRUD agent personas (admin role also required) |
| `corrections:write` | Append corrections (editor+ role also required) |
| `admin:*` | Wildcard for internal-admin agents |

## Known gotchas (learned in production)

### 1. Upsert is a full replace of the translation row
`PUT by-slug` replaces **all** translation fields. If you only send `seoDesc`, all other fields (`content`, `seoTitle`, `focusKeyword`, etc.) are wiped. Always send the complete payload.

### 2. PATCH /posts/{id} only updates post-level fields
`PATCH` touches the `posts` table (featuredImage, status, etc.) — **not** the `post_translations` table. To update `seoTitle`, `seoDesc`, `content`, `focusKeyword`, use `PUT by-slug` with the full payload.

### 3. GET /posts/{id} without locale returns no translation fields
The response only contains post-level columns. To read `seoDesc`, `content`, etc., query D1 directly:
```sql
SELECT * FROM post_translations WHERE post_id = ? AND locale = ?
```

### 4. Workers AI returns parsed JSON objects, not raw strings
`ai.run(model, { messages })` auto-parses JSON responses. If the prompt asks for `{"comment":"..."}`, `res.response` is `{ comment: "..." }` (object), not a string. Access `res.response.comment` directly — don't call `.trim()` on it.

### 5. API key user_id must match an existing user row
If a user is deleted and recreated, the `api_keys.user_id` FK points to the old (deleted) user. Auth middleware finds no user → returns `forbidden`. Fix: `UPDATE api_keys SET user_id = '<new-id>' WHERE id = '<key-id>'`.

### 6. Publish route requires AUTHOR rank (not EDITOR)
`POST /posts/{id}/publish` uses `requireRole(ROLES.AUTHOR)` — rank 2. Both `agent` and `author` roles can publish. `editor`/`admin` are included via rank hierarchy. (Note: `unpublish` and `delete` still require `ROLES.EDITOR`.)

### 7. AI conversation generation requires locale in request body
`POST /generate-conversation` body defaults `locale` to `'en'`. For Vietnamese posts, explicitly pass `{"locale":"vi"}` or the generator selects no eligible personas and returns `no_eligible_personas` error (500).

### 8. Personas must include the post locale (or 'auto') to be eligible
Personas with `languagePreference: ["en"]` are skipped for `vi` posts. Set `languagePreference: ["auto"]` for personas that should comment in any language.

### 9. Stuck `running` conversation runs block idempotency
The generator marks a run `running` at start. If the Worker times out mid-run, the run stays `running` forever — the cron only retries `failed` runs. Fix: `DELETE FROM conversation_runs WHERE post_id = ? AND status = 'running'`, then re-trigger.

### 10. opennextjs-cloudflare deploy can use stale bundles
If a freshly-deployed route returns 404, wipe and rebuild:
```bash
rm -rf apps/admin/.open-next apps/admin/.next
pnpm --filter @teguns/admin run build:cf
pnpm --filter @teguns/admin run deploy
```

### 11. `pnpm --filter <pkg> deploy` vs `run deploy`
Always use `pnpm --filter <pkg> run deploy`. Without `run`, pnpm intercepts `deploy` as its own built-in command.

### 12. SHA-256 API key hashing (not bcrypt)
Keys are hashed with `crypto.subtle` SHA-256 — bcrypt exceeds Workers CPU budget (~50ms). Legacy bcrypt hashes (`$2…`) are still verified via dynamic import during migration window. New keys always use SHA-256.

## File layout

```
apps/web/                  Public site (RSC + middleware)
apps/admin/                CMS + API surface (admin.tegunews.com)
  app/api/admin/[[...route]]/route.ts   ← authMiddleware MUST be mounted here
packages/db/src/schema/    Drizzle schema — single source of truth
packages/auth/src/
  api-keys.ts              SHA-256 hashing + bcrypt legacy fallback
  roles.ts                 ROLES constants + canPublish() etc.
packages/api/src/
  middleware/rbac.ts        requireRole() + requireScope()
  middleware/auth.ts        authMiddleware + verifyApiKey
  routes/posts.ts           CRUD + publish + by-slug upsert
  routes/agent-conversations.ts  generate-conversation endpoint
  agent-conversation/
    generator.ts            AI conversation generator (Workers AI)
    prompt.ts               Persona system prompt builder
    safety.ts               Output safety filter + extractCommentText
packages/agent-sdk/        Typed client for external agents
scripts/agents/
  create.ts                Mint API key
  revoke.ts                Revoke API key
```

## Adding a new field to a content type

Order matters — follow strictly:

1. `packages/db/src/schema/<table>.ts` — add column
2. `pnpm --filter @teguns/db generate` — emit migration
3. `pnpm --filter @teguns/db migrate:local` — apply locally
4. `packages/api/src/routes/<resource>.ts` — extend zod schema
5. `packages/agent-sdk/src/index.ts` — extend SDK types ← **most commonly skipped**
6. `packages/seo/` — only if field affects SEO scoring
7. `apps/admin/components/post-editor.tsx` — add UI input
8. `apps/web/` — only if field is reader-visible

## Observability

```sql
-- What did agents do to this resource?
SELECT created_at, user_id, action, resource_id, metadata
FROM audit_log WHERE resource_id = ? ORDER BY created_at DESC LIMIT 20

-- Are conversation runs stuck?
SELECT post_id, status, json_array_length(comment_ids) as comments
FROM conversation_runs ORDER BY created_at DESC

-- Comment pipeline health
SELECT status, COUNT(*) FROM comments GROUP BY status
```

`GET /api/health` — always 200; check `.ok` field for partial outages.
