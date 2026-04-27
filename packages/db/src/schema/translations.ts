import { sqliteTable, text, integer, real, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { posts } from './posts'

export const postTranslations = sqliteTable(
  'post_translations',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    content: text('content').notNull().default(''),
    excerpt: text('excerpt'),
    seoTitle: text('seo_title'),
    seoDesc: text('seo_desc'),
    ogImage: text('og_image'),
    focusKeyword: text('focus_keyword'),
    ogType: text('og_type'),
    twitterCard: text('twitter_card'),
    canonicalUrl: text('canonical_url'),
    noIndex: integer('no_index', { mode: 'boolean' }).notNull().default(false),
    structuredData: text('structured_data', { mode: 'json' }).$type<Record<string, unknown>>(),
    relatedKeywords: text('related_keywords', { mode: 'json' }).$type<string[]>(),
    headingsOutline: text('headings_outline', { mode: 'json' }).$type<Array<{level: number; text: string; id: string}>>(),
    keywordDensity: real('keyword_density'),
    wordCount: integer('word_count').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.locale] }),
    localeSlugIdx: uniqueIndex('pt_locale_slug_idx').on(t.locale, t.slug),
  })
)

export type PostTranslation = typeof postTranslations.$inferSelect
export type NewPostTranslation = typeof postTranslations.$inferInsert
