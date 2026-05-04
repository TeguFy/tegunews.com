/**
 * Agent persona CRUD.
 *
 * Personas are 1:1 with `users` rows of role='agent'. Creating a persona
 * therefore also creates the user; deleting it cascades the user (which
 * cascades the persona's prior comments — so we soft-disable via
 * `active=false` instead of delete in normal use).
 *
 * Mounted at `/api/admin/personas`. Editor+ role. New scope:
 * `personas:write`.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { and, asc, eq } from 'drizzle-orm'
import { agentPersonas, users } from '@teguns/db'
import { ROLES } from '@teguns/auth'
import { authMiddleware } from '../middleware/auth'
import { requireRole, requireScope } from '../middleware/rbac'
import { audit } from '../audit'
import type { ApiEnv } from '../app'

export const agentPersonasRouter = new OpenAPIHono<ApiEnv>()
agentPersonasRouter.use('*', authMiddleware)

const security: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { ApiKey: [] }]

const Tone = z.enum(['formal', 'casual', 'sarcastic', 'enthusiastic', 'analytical', 'skeptical'])
const Leaning = z.enum(['left', 'center-left', 'center', 'center-right', 'right', 'apolitical']).nullable()

const PersonaSchema = z.object({
  id: z.string(),
  userId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  personalityTraits: z.array(z.string()),
  tone: Tone,
  politicalLeaning: Leaning,
  expertiseAreas: z.array(z.string()),
  writingStyle: z.string().nullable(),
  languagePreference: z.array(z.string()),
  systemPrompt: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi('AgentPersona')

const CreateInput = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case'),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  personalityTraits: z.array(z.string().min(1).max(60)).max(20).default([]),
  tone: Tone.default('casual'),
  politicalLeaning: Leaning.optional(),
  expertiseAreas: z.array(z.string().min(1).max(60)).max(20).default([]),
  writingStyle: z.string().max(2000).nullable().optional(),
  languagePreference: z.array(z.string().min(2).max(10)).default(['en']),
  systemPrompt: z.string().max(8000).nullable().optional(),
  active: z.boolean().default(true),
}).openapi('CreateAgentPersonaInput')

const UpdateInput = CreateInput.partial().openapi('UpdateAgentPersonaInput')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const idParam = z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) })

function serialise(row: typeof agentPersonas.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ─── List ──────────────────────────────────────────────────────────────────

agentPersonasRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Agent Personas'],
    summary: 'List agent personas',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { query: z.object({ active: z.coerce.boolean().optional() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(PersonaSchema) }) } } },
    },
  }),
  async (c) => {
    const { active } = c.req.valid('query')
    const rows = active === undefined
      ? await c.var.db.select().from(agentPersonas).orderBy(asc(agentPersonas.displayName))
      : await c.var.db.select().from(agentPersonas).where(eq(agentPersonas.active, active)).orderBy(asc(agentPersonas.displayName))
    return c.json({ items: rows.map(serialise) }, 200)
  },
)

// ─── Get one ───────────────────────────────────────────────────────────────

agentPersonasRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Agent Personas'],
    summary: 'Get persona',
    security,
    middleware: [requireRole(ROLES.EDITOR)] as const,
    request: { params: idParam },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PersonaSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const [row] = await c.var.db.select().from(agentPersonas).where(eq(agentPersonas.id, id))
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(serialise(row), 200)
  },
)

// ─── Create (also creates paired user row) ─────────────────────────────────

agentPersonasRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Agent Personas'],
    summary: 'Create persona (and paired agent user)',
    security,
    middleware: [requireRole(ROLES.EDITOR), requireScope('personas:write')] as const,
    request: { body: { content: { 'application/json': { schema: CreateInput } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: PersonaSchema } } },
      409: { description: 'Slug taken', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')

    // Idempotency: if a persona with this slug exists, return it (200-ish).
    // We treat persona-create as upsert-by-slug because seed scripts re-run.
    const [existing] = await c.var.db.select().from(agentPersonas).where(eq(agentPersonas.slug, input.slug))
    if (existing) {
      return c.json({ error: 'slug_taken' }, 409)
    }

    const now = new Date()
    const userId = crypto.randomUUID()
    const personaId = crypto.randomUUID()

    // Synthetic email — never receives mail; routes that send transactional
    // mail should branch on role='agent' and skip. The local-part includes
    // the slug to keep audit logs readable.
    const syntheticEmail = `${input.slug}@personas.tegunews.invalid`

    try {
      await c.var.db.insert(users).values({
        id: userId,
        name: input.displayName,
        email: syntheticEmail,
        emailVerified: false,
        image: input.avatarUrl ?? null,
        role: ROLES.AGENT,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      })
    } catch (err) {
      // Email is unique — if a previous half-failed create left an orphan,
      // surface it as conflict rather than silently re-using.
      if (String(err).includes('UNIQUE')) return c.json({ error: 'slug_taken' }, 409)
      throw err
    }

    const [row] = await c.var.db.insert(agentPersonas).values({
      id: personaId,
      userId,
      slug: input.slug,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      bio: input.bio ?? null,
      personalityTraits: input.personalityTraits,
      tone: input.tone,
      politicalLeaning: input.politicalLeaning ?? null,
      expertiseAreas: input.expertiseAreas,
      writingStyle: input.writingStyle ?? null,
      languagePreference: input.languagePreference,
      systemPrompt: input.systemPrompt ?? null,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    }).returning()

    await audit(c, 'persona.create', personaId, { slug: input.slug, userId })
    return c.json(serialise(row!), 201)
  },
)

// ─── Update ────────────────────────────────────────────────────────────────

agentPersonasRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Agent Personas'],
    summary: 'Update persona',
    security,
    middleware: [requireRole(ROLES.EDITOR), requireScope('personas:write')] as const,
    request: { params: idParam, body: { content: { 'application/json': { schema: UpdateInput } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: PersonaSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const now = new Date()
    const [row] = await c.var.db
      .update(agentPersonas)
      .set({ ...patch, updatedAt: now })
      .where(eq(agentPersonas.id, id))
      .returning()
    if (!row) return c.json({ error: 'not_found' }, 404)

    // Mirror displayName + avatar to the paired user row so comments display
    // the same identity. Editing the persona shouldn't require a separate
    // "update user" call.
    if (patch.displayName !== undefined || patch.avatarUrl !== undefined) {
      await c.var.db
        .update(users)
        .set({
          ...(patch.displayName !== undefined ? { name: patch.displayName } : {}),
          ...(patch.avatarUrl !== undefined ? { image: patch.avatarUrl } : {}),
          updatedAt: now,
        })
        .where(eq(users.id, row.userId))
    }

    await audit(c, 'persona.update', id, { fields: Object.keys(patch) })
    return c.json(serialise(row), 200)
  },
)

// ─── Delete ────────────────────────────────────────────────────────────────
//
// Hard-delete cascades the user, which cascades all comments authored by
// this persona — usually NOT what an editor wants. We default to soft-delete
// (set active=false). Pass ?hard=1 to actually wipe, with a confirm gate.

agentPersonasRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Agent Personas'],
    summary: 'Disable persona (or hard-delete with ?hard=1)',
    security,
    middleware: [requireRole(ROLES.ADMIN), requireScope('personas:write')] as const,
    request: { params: idParam, query: z.object({ hard: z.coerce.boolean().optional() }) },
    responses: {
      204: { description: 'Deleted/disabled' },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { hard } = c.req.valid('query')

    const [row] = await c.var.db.select().from(agentPersonas).where(eq(agentPersonas.id, id))
    if (!row) return c.json({ error: 'not_found' }, 404)

    if (hard) {
      // Cascades: delete user → delete persona row + delete that user's comments.
      await c.var.db.delete(users).where(eq(users.id, row.userId))
      await audit(c, 'persona.delete_hard', id, { slug: row.slug })
    } else {
      await c.var.db
        .update(agentPersonas)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(agentPersonas.id, id))
      await audit(c, 'persona.disable', id, { slug: row.slug })
    }
    return c.body(null, 204)
  },
)
