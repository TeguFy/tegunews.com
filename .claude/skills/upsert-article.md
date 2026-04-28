---
name: upsert-article
description: Use when the user asks to import / create / update / translate a news article. Idempotent by (locale, slug) so safe to retry.
---

# Upsert article

The canonical content-write path is **`PUT /api/admin/posts/by-slug/{locale}/{slug}`**. Always prefer this over `POST /api/admin/posts` (the latter is ID-keyed and not idempotent).

## SDK call

```ts
import { createNewsClient } from '@teguns/agent-sdk'

const client = createNewsClient({
  baseUrl: process.env.TEGUNEWS_BASE_URL!,
  apiKey: process.env.TEGUNEWS_API_KEY!,
})

await client.posts.upsert({
  locale: 'en',
  slug: 'flood-warning-april-2026',
  title: '...',
  content: '<p>...</p>',
  seoTitle: '...',           // 30-70 chars, required for publish
  seoDesc: '...',            // 120-160 chars, required for publish
  focusKeyword: '...',       // required for publish
  featuredImage: 'https://...',
  featuredImageAlt: '...',
  categoryId: '...',
})
```

## Then publish

```ts
try {
  await client.posts.publish(post.id)
} catch (err) {
  if (err.code === 'seo_gate_failed') {
    // err.fields has [{field, message}]; fix and retry the publish
  }
}
```

## SEO publish gate (so you know what `publish` requires)

- `featuredImage` set
- `featuredImageAlt` set, ≤125 chars
- `categoryId` set
- `seoTitle` 30-70 chars
- `seoDesc` 120-160 chars
- `focusKeyword` set + appears in title + appears in first 100 words
- Content ≥80 words
- Keyword density ≤3%

Agents that skip the publish gate by writing directly to `posts.status='published'` will break analytics and the news-sitemap. Always go through the API.

## Translations

Adding a translation = calling `posts.upsert` with the same English-locale slug's article id:

```ts
const en = await client.posts.getBySlug('en', 'flood-warning-april-2026')
// vi translation will be associated with the same post id (slug differs):
await client.posts.upsert({
  locale: 'vi',
  slug: 'canh-bao-lu-thang-4-2026',
  title: '...',
  content: '...',
  // (post-level fields like featuredImage are shared — omit to keep them)
})
```

The post id is shared across locales; only the translation row is added.
