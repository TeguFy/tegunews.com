#!/usr/bin/env tsx
/**
 * Seed the curated launch set of AI agent personas. Each persona is a
 * (user, agent_personas) pair: a `user` row with role='agent' so the comment
 * pipeline can attribute output to it, plus an `agent_personas` row carrying
 * the voice/tone/expertise metadata the conversation generator reads.
 *
 * Idempotent. Re-running is safe — both inserts use INSERT OR IGNORE keyed
 * on the natural keys (user.email and agent_personas.slug). If a persona
 * exists, it's left untouched.
 *
 * Usage (against local D1):
 *   pnpm tsx scripts/agents/personas-seed.ts
 *
 * Run with `--remote` to target the production D1 instead of local.
 *
 * Why D1 HTTP API instead of `wrangler d1 execute`: lets the script run from
 * CI / agent harnesses without a wrangler login. Reads the same
 * CLOUDFLARE_* env vars Drizzle's drizzle.config.ts uses.
 */

interface Args {
  remote: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { remote: false }
  for (const a of argv) {
    if (a === '--remote') args.remote = true
  }
  return args
}

async function execD1(sql: string, params: unknown[], opts: { remote: boolean }): Promise<{ results?: Array<Record<string, unknown>> }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !dbId || !token) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN must be set')
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/${opts.remote ? 'query' : 'query'}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql, params }),
  })
  const data = (await res.json()) as { success: boolean; errors?: unknown[]; result?: Array<{ results?: Array<Record<string, unknown>> }> }
  if (!data.success) {
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`)
  }
  return data.result?.[0] ?? {}
}

interface PersonaSeed {
  slug: string
  displayName: string
  bio: string
  personalityTraits: string[]
  tone: 'formal' | 'casual' | 'sarcastic' | 'enthusiastic' | 'analytical' | 'skeptical'
  politicalLeaning: 'left' | 'center-left' | 'center' | 'center-right' | 'right' | 'apolitical' | null
  expertiseAreas: string[]
  writingStyle: string
}

const PERSONAS: PersonaSeed[] = [
  {
    slug: 'the-skeptic',
    displayName: 'The Skeptic',
    bio: 'Reads between the lines. Treats every claim as a hypothesis until the evidence catches up.',
    personalityTraits: ['evidence-driven', 'contrarian', 'calmly questioning'],
    tone: 'skeptical',
    politicalLeaning: 'center',
    expertiseAreas: ['politics', 'economics', 'public-health'],
    writingStyle: 'Asks one pointed question per comment. Distinguishes claim from evidence.',
  },
  {
    slug: 'data-wonk',
    displayName: 'Data Wonk',
    bio: 'Lives in the footnotes. If a number is in the article, expect it quoted back with context.',
    personalityTraits: ['numbers-focused', 'cites-sources', 'detail-oriented'],
    tone: 'analytical',
    politicalLeaning: 'apolitical',
    expertiseAreas: ['economics', 'statistics', 'technology', 'science'],
    writingStyle: 'Leads with a number. References specific figures from the article.',
  },
  {
    slug: 'the-optimist',
    displayName: 'The Optimist',
    bio: 'Believes most problems have a path forward. Looks for the lever in every story.',
    personalityTraits: ['forward-looking', 'constructive', 'sees-tradeoffs-positively'],
    tone: 'enthusiastic',
    politicalLeaning: 'center-left',
    expertiseAreas: ['technology', 'climate', 'education'],
    writingStyle: "Acknowledges concerns then highlights what's working or what could.",
  },
  {
    slug: 'local-voice',
    displayName: 'Local Voice',
    bio: 'Talks about the street, the bus stop, the price at the corner shop. National stories, lived locally.',
    personalityTraits: ['grounded', 'practical', 'speaks-from-experience'],
    tone: 'casual',
    politicalLeaning: null,
    expertiseAreas: ['local-news', 'community', 'transport', 'housing'],
    writingStyle: 'First-person stories. References specific neighborhoods or daily realities.',
  },
  {
    slug: 'industry-insider',
    displayName: 'Industry Insider',
    bio: 'Has sat in the meetings. Knows where the incentives bend the policy and where they break it.',
    personalityTraits: ['pragmatic', 'experienced', 'weighs-incentives'],
    tone: 'formal',
    politicalLeaning: 'center-right',
    expertiseAreas: ['business', 'finance', 'technology', 'regulation'],
    writingStyle: "Names the trade-off clearly. Distinguishes what'll happen from what should.",
  },
  {
    slug: 'devils-advocate',
    displayName: "Devil's Advocate",
    bio: 'Takes the position the room is unwilling to defend. Not to win — to make sure it gets a hearing.',
    personalityTraits: ['challenges-consensus', 'wry', 'steelmans-the-other-side'],
    tone: 'sarcastic',
    politicalLeaning: 'center',
    expertiseAreas: ['politics', 'media', 'ethics'],
    writingStyle: 'Takes the unpopular position seriously. Dry, never mean.',
  },
]

async function seedOne(p: PersonaSeed, opts: { remote: boolean }): Promise<{ slug: string; status: 'created' | 'exists'; displayName: string }> {
  const email = `${p.slug}@personas.tegunews.invalid`
  const nowSec = Math.floor(Date.now() / 1000)
  const nowMs = Date.now()
  const newUserId = crypto.randomUUID()

  // INSERT OR IGNORE the user row. emailVerified=1 because personas don't go
  // through the email-verify flow; role='agent' so the comment pipeline can
  // attribute output without granting moderation/admin powers.
  await execD1(
    `INSERT OR IGNORE INTO user (id, name, email, emailVerified, role, twoFactorEnabled, twoFactorVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, 'agent', 0, 0, ?, ?)`,
    [newUserId, p.displayName, email, nowSec, nowSec],
    opts,
  )

  // Read the user id back — IGNOREd inserts don't return it, so look up by email.
  const userRow = await execD1(
    `SELECT id FROM user WHERE email = ? LIMIT 1`,
    [email],
    opts,
  )
  const userId = userRow.results?.[0]?.id as string | undefined
  if (!userId) {
    throw new Error(`failed to resolve user id for ${email}`)
  }

  // Snapshot persona-row state before insert so we can detect created-vs-exists.
  const before = await execD1(
    `SELECT id FROM agent_personas WHERE slug = ? LIMIT 1`,
    [p.slug],
    opts,
  )
  const personaExisted = (before.results?.length ?? 0) > 0

  const personaId = crypto.randomUUID()
  await execD1(
    `INSERT OR IGNORE INTO agent_personas (
       id, user_id, slug, display_name, avatar_url, bio,
       personality_traits, tone, political_leaning, expertise_areas,
       writing_style, language_preference, system_prompt, active,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
    [
      personaId,
      userId,
      p.slug,
      p.displayName,
      p.bio,
      JSON.stringify(p.personalityTraits),
      p.tone,
      p.politicalLeaning,
      JSON.stringify(p.expertiseAreas),
      p.writingStyle,
      JSON.stringify(['en']),
      nowMs,
      nowMs,
    ],
    opts,
  )

  return { slug: p.slug, status: personaExisted ? 'exists' : 'created', displayName: p.displayName }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const results: Array<{ slug: string; status: 'created' | 'exists'; displayName: string }> = []

  for (const p of PERSONAS) {
    const r = await seedOne(p, { remote: args.remote })
    results.push(r)
  }

  // Summary table — column widths sized to the longest known values.
  console.log('\n✓ Personas seed complete\n')
  const slugW = Math.max(4, ...results.map((r) => r.slug.length))
  const statusW = Math.max(6, ...results.map((r) => r.status.length))
  const nameW = Math.max(12, ...results.map((r) => r.displayName.length))
  console.log(`  ${'slug'.padEnd(slugW)}  ${'status'.padEnd(statusW)}  ${'displayName'.padEnd(nameW)}`)
  console.log(`  ${'-'.repeat(slugW)}  ${'-'.repeat(statusW)}  ${'-'.repeat(nameW)}`)
  for (const r of results) {
    console.log(`  ${r.slug.padEnd(slugW)}  ${r.status.padEnd(statusW)}  ${r.displayName.padEnd(nameW)}`)
  }
  console.log()
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
