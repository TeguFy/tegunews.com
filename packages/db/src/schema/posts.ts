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
  readingTime: integer('reading_time'),
  internalLinksCount: integer('internal_links_count').notNull().default(0),
  externalLinksCount: integer('external_links_count').notNull().default(0),
}, (t) => ({
  statusIdx: index('posts_status_idx').on(t.status),
  authorIdx: index('posts_author_id_idx').on(t.authorId),
  categoryIdx: index('posts_category_id_idx').on(t.categoryId),
  publishedAtIdx: index('posts_published_at_idx').on(t.publishedAt),
  // Hot path: home/news page reads "published & featured & recent" — composite
  // index keeps the query off a full scan once the table grows.
  featuredPublishedIdx: index('posts_featured_published_idx').on(t.featured, t.publishedAt),
}))

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
