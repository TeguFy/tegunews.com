/**
 * Article corrections.
 *
 * News sites must publish corrections (factual errors, attribution mistakes)
 * with the same prominence as the article they amend. This table stores the
 * audit-trail of corrections; the article page renders them in chronological
 * order with the disclosure header "Correction: ...".
 *
 * Corrections are append-only — never deleted, never edited. If a correction
 * itself was wrong, append a new correction that supersedes it.
 *
 * Each correction is locale-scoped because the wording differs by language;
 * the same factual issue may need separate `en` and `vi` correction notes.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { posts } from './posts'

export const postCorrections = sqliteTable(
  'post_corrections',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    /**
     * The disclosure text shown to readers, in the article's locale. Plain
     * text only — no HTML, no markdown. Editors are encouraged to start with
     * "Correction:", "Update:", or "Clarification:" depending on the kind.
     */
    note: text('note').notNull(),
    /** Optional: the issuing editor / agent. */
    issuedBy: text('issued_by'),
    /** Did this correction trigger a re-publish (with `dateModified` bump)? */
    repushedAt: integer('repushed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    postIdx: index('corrections_post_idx').on(t.postId),
    postLocaleIdx: index('corrections_post_locale_idx').on(t.postId, t.locale),
  }),
)

export type PostCorrection = typeof postCorrections.$inferSelect
export type NewPostCorrection = typeof postCorrections.$inferInsert
