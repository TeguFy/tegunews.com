/**
 * Threaded reader comments.
 *
 * Threading: `parentId` is a self-reference. Depth is enforced in API code
 * (MAX_COMMENT_DEPTH = 5) — Drizzle/D1 cannot enforce depth at the schema
 * level on a recursive FK.
 *
 * Moderation states:
 *   - pending  — default for guest submissions; awaits editor action
 *   - approved — visible publicly; counted in posts.commentCount
 *   - spam     — hidden from public view; retained for training/audit
 *   - rejected — hidden from public view; user-visible "removed" placeholder
 *
 * Author identity:
 *   - `userId` set when the commenter was logged in (Better Auth session)
 *   - For guests, `authorName` + `authorEmail` are required by the API; email
 *     is hashed before write so we keep gravatar-style derivation but not the
 *     raw address (privacy by default).
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { posts } from './posts'

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): any => comments.id, { onDelete: 'cascade' }),
    // Resolved author identity — populated on insert from userId or guest input
    userId: text('user_id'),
    authorName: text('author_name').notNull(),
    authorEmailHash: text('author_email_hash'),    // sha256 hex; used for gravatar
    authorWebsite: text('author_website'),
    authorIpHash: text('author_ip_hash'),          // sha256(ip + daily-rotated salt)
    userAgent: text('user_agent'),
    body: text('body').notNull(),
    // Markdown is rendered server-side and the rendered HTML cached here so the
    // public list endpoint avoids re-rendering on every read.
    bodyHtml: text('body_html').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'spam', 'rejected'] })
      .notNull()
      .default('pending'),
    moderatedBy: text('moderated_by'),
    moderatedAt: integer('moderated_at', { mode: 'timestamp' }),
    spamScore: integer('spam_score'),              // 0-100 from the spam check
    upvotes: integer('upvotes').notNull().default(0),
    locale: text('locale'),                         // matches the article translation locale
    // True when the comment was authored by an AI agent persona (see
    // `agent_personas`). Set at insert time so the public renderer can show a
    // "🤖 AI persona" badge — non-negotiable disclosure for reader trust.
    isAiGenerated: integer('is_ai_generated', { mode: 'boolean' }).notNull().default(false),
    // Foreign key into conversation_runs — null for human/guest comments,
    // populated for comments created by a generation run. Lets us trace a
    // discussion back to the run that produced it (and bulk-revert if needed).
    conversationRunId: text('conversation_run_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    postIdx: index('comments_post_idx').on(t.postId),
    parentIdx: index('comments_parent_idx').on(t.parentId),
    statusIdx: index('comments_status_idx').on(t.status),
    // Moderation queue is "WHERE status = 'pending' ORDER BY createdAt"
    pendingQueueIdx: index('comments_pending_queue_idx').on(t.status, t.createdAt),
    userIdx: index('comments_user_idx').on(t.userId),
  }),
)

export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
