# tegunews.com

A multilingual, SEO-first news site with reader comments. Cloudflare-native (D1 + R2 + KV + Workers), Next.js 16 App Router, Turborepo monorepo.

**Production** — <https://tegunews.com> · **Admin** — <https://admin.tegunews.com>

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, RSC) |
| Monorepo | Turborepo + pnpm 10 workspaces |
| Runtime | Cloudflare Workers (via `@opennextjs/cloudflare`) |
| Storage | D1 (SQL) · R2 (media) · KV (cache + tag cache) |
| ORM | Drizzle ORM |
| Auth | Better Auth (email + OAuth) with RBAC |
| UI | shadcn/ui · Tailwind CSS v4 · Tiptap (editor) |
| i18n | next-intl (EN, VI) |
| API | Hono + zod-openapi |

## Why news + comments + SEO

This project is the news-focused sibling of `tegureview.com`. The data model and apps are tuned for:

- **News articles**: `posts` table specialised to a single `news` type, with breaking/featured flags and a strict publish workflow.
- **Threaded comments**: `comments` table with `parentId` for threads, moderation states (`pending` / `approved` / `spam` / `rejected`), guest + authenticated authors, and a per-article moderation queue in the admin.
- **News SEO**: `NewsArticle` + `LiveBlogPosting` JSON-LD generators, news-tuned sitemap (`<news:news>` extension), RSS, AMP-ready metadata helpers.

## Quick start

```bash
pnpm install
pnpm dev          # web on :3000, admin on :3001
```

Requires Node 22, pnpm 10, and wrangler 4.

## Monorepo layout

```
apps/web        Public news site (tegunews.com)
apps/admin      Admin dashboard (admin.tegunews.com) — articles + comment moderation
packages/db     Drizzle + D1 schema (articles, comments, taxonomy, auth)
packages/auth   Better Auth + RBAC + CSRF + audit + API keys
packages/seo    SEO validators, NewsArticle JSON-LD, news-sitemap helpers
packages/api    Hono + zod-openapi (mounted in admin) — articles + comments
packages/ui     shadcn/ui components
```

## One-time Cloudflare setup

```bash
wrangler login
wrangler d1 create tegunews
wrangler kv namespace create CACHE
wrangler kv namespace create CACHE --preview
wrangler r2 bucket create tegunews-media
wrangler r2 bucket create tegunews-media-dev
```

Put the resource IDs into `apps/web/wrangler.jsonc` and `apps/admin/wrangler.jsonc`, then apply migrations:

```bash
pnpm --filter @teguns/db generate
cp packages/db/migrations/*.sql apps/web/migrations/
cd apps/web && wrangler d1 migrations apply tegunews --local   # local
cd apps/web && wrangler d1 migrations apply tegunews           # production
```

## Deploy

```bash
pnpm --filter @teguns/web build:cf  && pnpm --filter @teguns/web run deploy
pnpm --filter @teguns/admin build:cf && pnpm --filter @teguns/admin run deploy
```

## License

Private.
