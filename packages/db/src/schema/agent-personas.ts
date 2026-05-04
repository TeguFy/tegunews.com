/**
 * Agent personas — virtual commenter identities that an LLM ventriloquises
 * when seeding article discussions.
 *
 * Each persona is paired 1:1 with a row in `users` (role='agent', no
 * password / no session). That gives us:
 *
 *   - FK integrity: comments.userId already references users.id, so a
 *     persona-authored comment is a normal comment, not a special case.
 *   - Moderation hygiene: persona comments flow through classifyComment +
 *     renderCommentBody just like real users — same XSS/spam guards.
 *   - Disclosure: comments authored by an agent-role user are flagged
 *     `isAiGenerated=true` at insert time, surfacing a "🤖 AI persona" badge
 *     to readers. Editorial honesty by default.
 *
 * Personality fields are deliberately structured (traits[], tone, leaning)
 * so a deterministic prompt builder can compose them; `systemPrompt` is the
 * escape hatch when an editor wants full control over voice.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './better-auth'

export const agentPersonas = sqliteTable(
  'agent_personas',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    /**
     * 1:1 with a `user` row whose role='agent'. The persona row is the
     * personality; the user row is the identity that owns comments.
     */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Stable identifier for idempotent provisioning from seeds / scripts. */
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    /** Free-form personality descriptors. Joined into the system prompt. */
    personalityTraits: text('personality_traits', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    tone: text('tone', {
      enum: ['formal', 'casual', 'sarcastic', 'enthusiastic', 'analytical', 'skeptical'],
    })
      .notNull()
      .default('casual'),
    /** Editorial bias signal. Null = unspecified / apolitical. */
    politicalLeaning: text('political_leaning', {
      enum: ['left', 'center-left', 'center', 'center-right', 'right', 'apolitical'],
    }),
    /** Topic areas this persona prefers to comment on. Used for matching against post category. */
    expertiseAreas: text('expertise_areas', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Free-form prose: "Writes in short punchy sentences, uses one rhetorical question per comment." */
    writingStyle: text('writing_style'),
    /**
     * Locales this persona will respond in. ['en','vi'] etc. The special
     * value `'auto'` means "match whatever locale the post (or parent
     * comment thread) is in" — useful for personas whose voice transcends
     * a single language. `['auto']` matches every locale; mixing fixed
     * locales with `'auto'` is allowed but redundant (auto already wins).
     */
    languagePreference: text('language_preference', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'["en"]'`),
    /** Editor override. When non-null, the prompt builder skips composition and uses this verbatim. */
    systemPrompt: text('system_prompt'),
    /** Toggle without deleting — preserves history of generated comments. */
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    userIdx: index('agent_personas_user_idx').on(t.userId),
    activeIdx: index('agent_personas_active_idx').on(t.active),
  }),
)

export type AgentPersona = typeof agentPersonas.$inferSelect
export type NewAgentPersona = typeof agentPersonas.$inferInsert
