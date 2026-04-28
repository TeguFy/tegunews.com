import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * News articles. Single-purpose `posts` table — there is no `type` discriminator
 * because every row is a news article. Use `categories` for taxonomy and the
 * `featured` / `breakingUntil` flags for editorial promotion.
 */
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  status: text('status', { enum: ['draft', 'published', 'scheduled'] })
    .notNull()
    .default('draft'),
  featuredImage: text('featured_image'),
  featuredImageAlt: text('featured_image_alt'),
  featuredImageCredit: text('featured_image_credit'),
  authorId: text('author_id').notNull(),
  authorName: text('author_name'),
  authorAvatar: text('author_avatar'),
  categoryId: text('category_id'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // News-specific editorial flags
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  // When set, the article shows the "BREAKING" badge until this timestamp.
  breakingUntil: integer('breaking_until', { mode: 'timestamp' }),
  // Per-article comment toggle. Editors can lock contentious articles.
  commentsEnabled: integer('comments_enabled', { mode: 'boolean' }).notNull().default(true),
  // Denormalised count of `approved` comments. Updated by the comment moderation
  // path; readers see this without a join.
  commentCount: integer('comment_count').notNull().default(0),
  // Lifetime view count, bumped by `/api/track/view`. Engagement signal for
  // the trending endpoint + agents picking what to feature. Edge tracker is
  // rate-limited per IP so a single visitor can't inflate the count.
  viewCount: integer('view_count').notNull().default(0),
  readingTime: integer('reading_time'),
  internalLinksCount: integer('internal_links_count').notNull().default(0),
  externalLinksCount: integer('external_links_count').notNull().default(0),
  // Syndication / source attribution. Required for wire-service imports
  // under most licensing agreements (AP, Reuters, AFP). Nullable for
  // original reporting.
  originalSourceUrl: text('original_source_url'),
  originalSourceName: text('original_source_name'),
  // Disclosure shown next to the byline. Examples:
  //   'AI-assisted'  — agent drafted, editor reviewed
  //   'AI-generated' — fully agent-authored, no human edit
  //   'wire'         — wire-service import (also requires originalSource* set)
  // Null = staff-written. Surfaces in the article header for reader trust.
  bylineDisclosure: text('byline_disclosure'),
  // Optimistic-locking version. Bumped on every update; PATCH/PUT can pass
  // an `If-Match: <version>` header to detect concurrent agent races.
  version: integer('version').notNull().default(1),
}, (t) => ({
  statusIdx: index('posts_status_idx').on(t.status),
  authorIdx: index('posts_author_id_idx').on(t.authorId),
  categoryIdx: index('posts_category_id_idx').on(t.categoryId),
  publishedAtIdx: index('posts_published_at_idx').on(t.publishedAt),
  // Hot path: home/news page reads "published & featured & recent" — composite
  // index keeps the query off a full scan once the table grows.
  featuredPublishedIdx: index('posts_featured_published_idx').on(t.featured, t.publishedAt),
  // Cron job that promotes scheduled→published reads `WHERE status='scheduled'
  // AND publishedAt <= now()`. Composite index serves both columns.
  scheduledIdx: index('posts_scheduled_idx').on(t.status, t.publishedAt),
}))

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
