# tegunews.com — agent guide

News site (multilingual EN/VI) with reader comments. Turborepo monorepo, ships entirely on Cloudflare Workers via opennextjs-cloudflare.

## Stack

- **Apps**: `apps/web` (public site, Next.js 16 + next-intl en/vi), `apps/admin` (CMS, Next.js 16 + Better Auth + Tiptap + comment moderation queue)
- **Packages**: `packages/{db,auth,api,seo,ui}` (workspace `@teguns/*`)
- **Infra**: D1 (db), R2 (media), KV (cache + tag cache), Analytics Engine (`tegunews_events`)
- **Auth**: Better Auth, role-gated (`admin` / `editor` / `author` / `commenter`)
- **Deploy**: `opennextjs-cloudflare` → `wrangler` push, custom domains `tegunews.com` + `admin.tegunews.com`

## Common ops

```bash
# Type-check
pnpm --filter @teguns/admin type-check
pnpm --filter @teguns/web type-check

# Build
pnpm --filter @teguns/admin build           # next build
pnpm --filter @teguns/admin build:cf        # opennextjs-cloudflare build → .open-next/

# Tests
pnpm test                                   # root, runs workspaces

# Deploy — DOES PUSH TO PROD; not allowlisted, must confirm
pnpm --filter @teguns/admin run deploy
pnpm --filter @teguns/web run deploy

# Live worker logs
wrangler tail tegunews-admin
wrangler tail tegunews-web
```

## Project-specific gotchas

- **Comments require moderation by default.** New comments land in `pending`. Public list endpoint filters to `approved`. The admin queue is at `/comments` and uses `requireRole('editor')`.
- **Comment threading is `parent_id` self-reference.** Depth is enforced in the API (`MAX_COMMENT_DEPTH = 5`) — direct DB inserts can violate it. When seeding, walk the parent chain.
- **`pnpm --filter <pkg> deploy` clashes with pnpm's built-in `deploy`** — always use `pnpm --filter <pkg> run deploy`.
- **`opennextjs-cloudflare deploy` can use stale `.open-next/` bundles** when new route files are added. If a freshly-deployed route returns 404, wipe and rebuild:
  ```bash
  rm -rf apps/admin/.open-next apps/admin/.next
  pnpm --filter @teguns/admin run build:cf
  pnpm --filter @teguns/admin run deploy
  ```
- **News SEO uses `NewsArticle`, not `Article`.** Sitemap emits `<news:news>` for items published in the last 48h (Google News window).

## Anti-scraping (light)

Single per-IP rate limit at the Worker edge. AI bots and search engines bypass it (welcome traffic); everyone else shares one 120-req/min bucket. Real readers never hit it; runaway scripts slow down. Not a wall — just friction.

- **`apps/web/middleware.ts`** — runs at the edge before SSR. Returns 429 when the bucket is empty.
- **`apps/web/lib/scraper-detection.ts`** — `bot` vs `default` UA classifier. `bot` matches AI training crawlers and search engines.
- **`apps/web/wrangler.jsonc`** → `ratelimits[].RATE_LIMITER` — tighten the limit here if abuse picks up.
- **`apps/web/app/robots.ts`** — open to all bots; only `/admin/`, `/api/`, `/_next/` are disallowed.

If you want stronger protection later, the cheapest next step is enabling **Cloudflare → Security → Bots → Bot Fight Mode** in the dashboard. No code change needed.

## Workflow expectations

- Commit pending work before starting a new task. Group by logical concern; never use `git add -A`.
- Don't push to remote unless explicitly asked.
