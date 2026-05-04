/**
 * AI conversation generator.
 *
 * Reads a published post, picks 3-5 active personas weighted by category
 * match, and produces a multi-turn discussion using Workers AI. Inserts
 * the resulting comments via the same pipeline as human comments
 * (renderCommentBody for HTML, classifyComment-equivalent decision via
 * `safety.ts`).
 *
 * Idempotency: a `conversation_runs` row is created up-front in
 * `status='running'`. If a completed run already exists for (postId,
 * locale), the generator no-ops — auto-publish hooks can call this freely
 * on retries without doubling the discussion.
 *
 * Failure mode: if any pass throws or the AI returns nothing usable, the
 * run is marked `failed` with the error captured. The cron worker retries
 * up to 3 times. Comments already inserted in earlier passes of a partial
 * run are kept (a half-discussion is better than no discussion, and the
 * editor can manually trigger another run to top it up).
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  agentPersonas,
  comments,
  conversationRuns,
  posts,
  postTranslations,
  categories,
  users,
  type AgentPersona,
  type ConversationRun,
} from '@teguns/db'
import type { Database } from '@teguns/db'
import { renderCommentBody } from '../comment-policy'
import { buildPersonaSystemPrompt, buildReplyUserPrompt, type PostContext, type PriorComment } from './prompt'
import { checkCommentSafety, extractCommentText } from './safety'

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export interface GenerateOpts {
  postId: string
  locale: string
  /** Restrict to these persona ids — otherwise auto-select by expertise + locale. */
  personaIds?: string[]
  /** 1=top-level only, 2=one round of replies, 3=full debate. */
  depth?: 1 | 2 | 3
  /** How many top-level comments to generate. Default 3-5 chosen pseudo-randomly. */
  topLevelCount?: number
  /** Override Workers AI model. */
  model?: string
  /** Audit signal — who/what triggered this. */
  triggeredBy?: ConversationRun['triggeredBy']
  triggeredByUserId?: string | null
  /** Validate without writing — useful for previewing prompts. */
  dryRun?: boolean
}

export interface GenerateResult {
  runId: string
  status: ConversationRun['status']
  commentIds: string[]
  /** Reasons individual passes were skipped (safety / model error). */
  skipped: Array<{ stage: string; reason: string }>
  /** Only present in dryRun mode. */
  preview?: Array<{ persona: string; body: string; replyTo?: string }>
}

/** Loose Ai binding — Cloudflare's types lag the real surface. */
interface AiBinding {
  run(model: string, input: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; max_tokens?: number; temperature?: number; stream?: boolean }): Promise<{ response?: string } | ReadableStream>
}

export async function generateConversation(
  db: Database,
  ai: AiBinding,
  opts: GenerateOpts,
): Promise<GenerateResult> {
  const skipped: GenerateResult['skipped'] = []
  const depth = opts.depth ?? 2
  const model = opts.model ?? DEFAULT_MODEL

  // ─── Idempotency check ─────────────────────────────────────────────────
  const existing = await db
    .select()
    .from(conversationRuns)
    .where(
      and(
        eq(conversationRuns.postId, opts.postId),
        eq(conversationRuns.locale, opts.locale),
        eq(conversationRuns.status, 'completed'),
      ),
    )
    .limit(1)
  if (existing.length > 0 && opts.triggeredBy === 'auto_publish') {
    return { runId: existing[0]!.id, status: 'completed', commentIds: existing[0]!.commentIds, skipped: [{ stage: 'idempotency', reason: 'already_completed' }] }
  }

  // ─── Load post + translation + category ────────────────────────────────
  const [postRow] = await db.select().from(posts).where(eq(posts.id, opts.postId))
  if (!postRow) throw new Error('post_not_found')
  const [translation] = await db
    .select()
    .from(postTranslations)
    .where(and(eq(postTranslations.postId, opts.postId), eq(postTranslations.locale, opts.locale)))
  if (!translation) throw new Error('translation_not_found')

  let categoryName: string | null = null
  if (postRow.categoryId) {
    const [cat] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, postRow.categoryId))
    categoryName = cat?.name ?? null
  }

  const postCtx: PostContext = {
    title: translation.title,
    excerpt: translation.excerpt,
    content: translation.content,
    locale: opts.locale,
    categoryName,
  }

  // ─── Persona selection ─────────────────────────────────────────────────
  let candidatePool: AgentPersona[] = await db
    .select()
    .from(agentPersonas)
    .where(eq(agentPersonas.active, true))

  if (opts.personaIds && opts.personaIds.length > 0) {
    candidatePool = candidatePool.filter((p) => opts.personaIds!.includes(p.id))
  } else {
    // Locale-match first. A persona is eligible if it explicitly lists this
    // locale, lists 'auto' (= match the post's locale, whatever it is), or
    // has an empty preference list (legacy data — treat as universal).
    candidatePool = candidatePool.filter(
      (p) =>
        p.languagePreference.length === 0 ||
        p.languagePreference.includes('auto') ||
        p.languagePreference.includes(opts.locale),
    )
  }

  if (candidatePool.length === 0) {
    throw new Error('no_eligible_personas')
  }

  // Score by expertise overlap with category, otherwise random.
  const scored = candidatePool.map((p) => {
    const match = categoryName
      ? p.expertiseAreas.filter((e) => categoryName!.toLowerCase().includes(e.toLowerCase()) || e.toLowerCase().includes(categoryName!.toLowerCase())).length
      : 0
    return { persona: p, score: match + Math.random() }
  })
  scored.sort((a, b) => b.score - a.score)

  const topLevelCount = Math.min(
    opts.topLevelCount ?? Math.min(5, Math.max(3, candidatePool.length)),
    scored.length,
  )
  const selected = scored.slice(0, topLevelCount).map((s) => s.persona)

  // ─── Create run row (running) ─────────────────────────────────────────
  const runId = crypto.randomUUID()
  if (!opts.dryRun) {
    await db.insert(conversationRuns).values({
      id: runId,
      postId: opts.postId,
      locale: opts.locale,
      status: 'running',
      triggeredBy: opts.triggeredBy ?? 'manual',
      triggeredByUserId: opts.triggeredByUserId ?? null,
      personaIds: selected.map((p) => p.id),
      commentIds: [],
      depth,
      model,
    })
  }

  const insertedCommentIds: string[] = []
  const previews: NonNullable<GenerateResult['preview']> = []
  const generatedComments: Array<{ id: string; personaId: string; personaSlug: string; authorName: string; body: string; depth: number }> = []

  // ─── Pass 1: top-level comments ───────────────────────────────────────
  for (const persona of selected) {
    const body = await runOne(ai, model, [
      { role: 'system', content: buildPersonaSystemPrompt(persona, postCtx) },
      { role: 'user', content: 'Write your comment now.' },
    ])
    if (!body) {
      skipped.push({ stage: `top.${persona.slug}`, reason: 'no_output' })
      continue
    }
    const safety = checkCommentSafety(body)
    if (!safety.ok) {
      skipped.push({ stage: `top.${persona.slug}`, reason: `safety:${safety.reason}` })
      continue
    }
    if (opts.dryRun) {
      previews.push({ persona: persona.slug, body: safety.body! })
      continue
    }
    const commentId = await insertPersonaComment(db, {
      postId: opts.postId,
      parentId: null,
      persona,
      body: safety.body!,
      locale: opts.locale,
      runId,
    })
    insertedCommentIds.push(commentId)
    generatedComments.push({ id: commentId, personaId: persona.id, personaSlug: persona.slug, authorName: persona.displayName, body: safety.body!, depth: 1 })
  }

  // ─── Pass 2: depth-2 replies ──────────────────────────────────────────
  if (depth >= 2 && generatedComments.length >= 2) {
    // Each persona replies to one comment they didn't write. Skips ~30% to
    // keep the thread feeling natural rather than every-comment-replied-to.
    const SKIP_RATE = 0.3
    for (const persona of selected) {
      if (Math.random() < SKIP_RATE) continue
      const candidates = generatedComments.filter((c) => c.personaId !== persona.id && c.depth === 1)
      if (candidates.length === 0) continue
      const target = candidates[Math.floor(Math.random() * candidates.length)]!

      const prior: PriorComment[] = generatedComments
        .filter((c) => c.id !== target.id)
        .map((c) => ({ authorName: c.authorName, body: c.body, personaSlug: c.personaSlug }))

      const body = await runOne(ai, model, [
        { role: 'system', content: buildPersonaSystemPrompt(persona, postCtx) },
        { role: 'user', content: buildReplyUserPrompt(prior, { authorName: target.authorName, body: target.body }) },
      ])
      if (!body) {
        skipped.push({ stage: `reply2.${persona.slug}`, reason: 'no_output' })
        continue
      }
      const safety = checkCommentSafety(body)
      if (!safety.ok) {
        skipped.push({ stage: `reply2.${persona.slug}`, reason: `safety:${safety.reason}` })
        continue
      }
      if (opts.dryRun) {
        previews.push({ persona: persona.slug, body: safety.body!, replyTo: target.personaSlug })
        continue
      }
      const commentId = await insertPersonaComment(db, {
        postId: opts.postId,
        parentId: target.id,
        persona,
        body: safety.body!,
        locale: opts.locale,
        runId,
      })
      insertedCommentIds.push(commentId)
      generatedComments.push({ id: commentId, personaId: persona.id, personaSlug: persona.slug, authorName: persona.displayName, body: safety.body!, depth: 2 })
    }
  }

  // ─── Pass 3: depth-3 (only ~30% of depth-2 replies get a counter) ─────
  if (depth >= 3) {
    const REPLY_3_RATE = 0.3
    const depth2 = generatedComments.filter((c) => c.depth === 2)
    for (const target of depth2) {
      if (Math.random() > REPLY_3_RATE) continue
      const responder = selected.find((p) => p.id !== target.personaId)
      if (!responder) continue

      const prior: PriorComment[] = generatedComments
        .filter((c) => c.id !== target.id)
        .map((c) => ({ authorName: c.authorName, body: c.body, personaSlug: c.personaSlug }))

      const body = await runOne(ai, model, [
        { role: 'system', content: buildPersonaSystemPrompt(responder, postCtx) },
        { role: 'user', content: buildReplyUserPrompt(prior, { authorName: target.authorName, body: target.body }) },
      ])
      if (!body) { skipped.push({ stage: `reply3.${responder.slug}`, reason: 'no_output' }); continue }
      const safety = checkCommentSafety(body)
      if (!safety.ok) { skipped.push({ stage: `reply3.${responder.slug}`, reason: `safety:${safety.reason}` }); continue }
      if (opts.dryRun) { previews.push({ persona: responder.slug, body: safety.body!, replyTo: target.personaSlug }); continue }
      const commentId = await insertPersonaComment(db, {
        postId: opts.postId,
        parentId: target.id,
        persona: responder,
        body: safety.body!,
        locale: opts.locale,
        runId,
      })
      insertedCommentIds.push(commentId)
    }
  }

  // ─── Bump comment count + finalise run ────────────────────────────────
  if (!opts.dryRun) {
    if (insertedCommentIds.length > 0) {
      await db
        .update(posts)
        .set({ commentCount: sql`${posts.commentCount} + ${insertedCommentIds.length}` })
        .where(eq(posts.id, opts.postId))
    }

    await db
      .update(conversationRuns)
      .set({
        status: 'completed',
        commentIds: insertedCommentIds,
        completedAt: new Date(),
      })
      .where(eq(conversationRuns.id, runId))
  }

  return {
    runId,
    status: opts.dryRun ? 'queued' : 'completed',
    commentIds: insertedCommentIds,
    skipped,
    preview: opts.dryRun ? previews : undefined,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function runOne(
  ai: AiBinding,
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string | null> {
  try {
    const res = await ai.run(model, { messages, max_tokens: 400, temperature: 0.85, stream: false })
    if (!res || res instanceof ReadableStream) return null
    const raw = (res as any).response
    // Workers AI auto-parses JSON responses: `response` may be the parsed
    // object `{ comment: "..." }` rather than a raw string. Handle both.
    if (raw && typeof raw === 'object' && typeof raw.comment === 'string') {
      return raw.comment.trim() || null
    }
    const text = typeof raw === 'string' ? raw : null
    if (!text) return null
    return extractCommentText(text)
  } catch (err) {
    // Network blip or model overload — caller logs to skipped[] and moves on.
    console.warn(JSON.stringify({ event: 'ai.run_failed', error: String(err) }))
    return null
  }
}

interface InsertArgs {
  postId: string
  parentId: string | null
  persona: AgentPersona
  body: string
  locale: string
  runId: string
}

async function insertPersonaComment(db: Database, args: InsertArgs): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date()
  const { html } = renderCommentBody(args.body)

  await db.insert(comments).values({
    id,
    postId: args.postId,
    parentId: args.parentId,
    userId: args.persona.userId,
    authorName: args.persona.displayName,
    authorEmailHash: null,
    authorWebsite: null,
    authorIpHash: null,
    userAgent: null,
    body: args.body,
    bodyHtml: html,
    // Auto-approve generated content (per project decision). Safety filter
    // already rejected the unsafe outputs.
    status: 'approved',
    locale: args.locale,
    isAiGenerated: true,
    conversationRunId: args.runId,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/**
 * Mark a run as failed. Called by the route handler when generation throws
 * outside the per-pass try blocks.
 */
export async function markRunFailed(db: Database, runId: string, error: string): Promise<void> {
  await db
    .update(conversationRuns)
    .set({
      status: 'failed',
      error: error.slice(0, 500),
      retries: sql`${conversationRuns.retries} + 1`,
      completedAt: new Date(),
    })
    .where(eq(conversationRuns.id, runId))
}

/**
 * Cron task: retry failed runs up to N attempts. Called from
 * `apps/cron/src/worker.ts` on a less-frequent cron (e.g. every 5 min).
 */
export async function retryFailedConversations(
  db: Database,
  ai: AiBinding,
  opts?: { maxRetries?: number; limit?: number },
): Promise<{ retried: number; succeeded: number }> {
  const maxRetries = opts?.maxRetries ?? 3
  const limit = opts?.limit ?? 5

  const candidates = await db
    .select()
    .from(conversationRuns)
    .where(and(eq(conversationRuns.status, 'failed'), sql`${conversationRuns.retries} < ${maxRetries}`))
    .limit(limit)

  let succeeded = 0
  for (const run of candidates) {
    try {
      await db.update(conversationRuns).set({ status: 'running' }).where(eq(conversationRuns.id, run.id))
      const result = await generateConversation(db, ai, {
        postId: run.postId,
        locale: run.locale,
        depth: run.depth as 1 | 2 | 3,
        triggeredBy: 'retry',
      })
      if (result.status === 'completed') succeeded++
    } catch (err) {
      await markRunFailed(db, run.id, String(err))
    }
  }
  return { retried: candidates.length, succeeded }
}

// Convenience: bulk-load personas by id (used by API routes).
export async function loadPersonas(db: Database, ids: string[]): Promise<AgentPersona[]> {
  if (ids.length === 0) return []
  return db.select().from(agentPersonas).where(inArray(agentPersonas.id, ids))
}

// Convenience: bulk-load user rows tied to personas, e.g. for "are these
// agents real?" sanity checks during seed.
export async function loadPersonaUsers(db: Database, userIds: string[]) {
  if (userIds.length === 0) return []
  return db.select().from(users).where(inArray(users.id, userIds))
}
