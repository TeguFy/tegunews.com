import { sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { posts } from './posts'

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  featuredImage: text('featured_image'),
})

export const postTags = sqliteTable(
  'post_tags',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.tagId] }),
    tagIdIdx: index('post_tags_tag_id_idx').on(t.tagId),
  })
)

export type Tag = typeof tags.$inferSelect
