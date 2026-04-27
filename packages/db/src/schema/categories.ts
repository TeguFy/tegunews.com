import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  parentId: text('parent_id').references((): any => categories.id, { onDelete: 'set null' }),
  description: text('description'),
  seoTitle: text('seo_title'),
  seoDesc: text('seo_desc'),
  featuredImage: text('featured_image'),
})

export type Category = typeof categories.$inferSelect
