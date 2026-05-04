/**
 * Conversation generation runs.
 *
 * One row per attempt to seed AI-driven discussion on an article. Lets us:
 *   - Dedupe: skip auto-generation if a `completed` run already exists for
 *     (postId, locale).
 *   - Audit: editors can see who/when/which-personas, and re-trigger if the
 *     output was poor.
 *   - Recover: a `failed` row keeps the error so the cron worker (or a human)
 *     can retry.
 *
 * The actual generated comments live in the `comments` table — we store
 * their ids here as a cross-reference for "show me the discussion this run
 * produced".
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { posts } from './posts'

export const conversationRuns = sqliteTable(
  'conversation_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] })
      .notNull()
      .default('queued'),
    triggeredBy: text('triggered_by', { enum: ['auto_publish', 'manual', 'scheduled', 'retry'] })
      .notNull()
      .default('manual'),
    /** User id of the editor / agent that triggered this run. Null for cron. */
    triggeredByUserId: text('triggered_by_user_id'),
    /** Persona ids selected for this run. */
    personaIds: text('persona_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Ids of comments inserted by this run. */
    commentIds: text('comment_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Max reply depth attempted for this run (1=top-level only, 3=full debate). */
    depth: integer('depth').notNull().default(2),
    /** Workers AI model used. Recorded for reproducibility / cost analysis. */
    model: text('model'),
    /** Error message if status='failed'. */
    error: text('error'),
    /** Retry counter — capped by the cron retry policy. */
    retries: integer('retries').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => ({
    postIdx: index('conversation_runs_post_idx').on(t.postId),
    statusIdx: index('conversation_runs_status_idx').on(t.status),
    // Cron retry path: WHERE status='failed' AND retries < N — composite index avoids a scan.
    failedQueueIdx: index('conversation_runs_failed_queue_idx').on(t.status, t.retries),
  }),
)

export type ConversationRun = typeof conversationRuns.$inferSelect
export type NewConversationRun = typeof conversationRuns.$inferInsert
